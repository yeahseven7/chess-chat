/**
 * Analysis pipeline. Messages are saved and visible immediately; classification
 * runs through the analysis_jobs queue with bounded exponential backoff.
 * Delivery never waits for AI — enqueue is fast (a single row insert) and the
 * provider call happens in a background drain, never in the send path.
 *
 * Timing instrumentation (all via console.info with [perf] prefix):
 *   - persist   : message INSERT in the send route
 *   - enqueue   : analysis_jobs INSERT in the send route
 *   - claim     : job claimed from the queue
 *   - classify  : provider request start → completion
 *   - save      : reaction upsert + job completion
 *   - delivery  : client-observed reaction replace (logged by the client)
 */
import { after } from "next/server";
import { getStore } from "@/lib/server/store";
import { getAIProvider } from "./factory";
import { isRetryableError, ProviderError } from "./errors";
import { publishReactionUpdate } from "@/lib/server/realtimePublisher";

export const MAX_ATTEMPTS = 4;
export const BASE_RETRY_SECONDS = 2;

/** Exponential backoff with jitter: 2s, 4s, 8s, 16s … */
export function retryDelaySeconds(attempt: number, jitterMs = 0): number {
  const base = BASE_RETRY_SECONDS * 2 ** Math.max(0, attempt - 1);
  return base + jitterMs / 1000;
}

/** Enqueue a job for a message (idempotent — active jobs are deduplicated). */
export async function enqueueAnalysis(messageId: string): Promise<{ jobId: string; created: boolean }> {
  const store = getStore();
  const start = performance.now();
  const result = await store.enqueueAnalysisJob(messageId);
  console.error(
    `[perf] enqueue messageId=${messageId} created=${result.created} ${Math.round(performance.now() - start)}ms`
  );
  return result;
}

export interface ProcessSummary {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  skipped: number;
}

/** Drain due jobs. Safe to call concurrently (jobs are claimed atomically). */
export async function processAnalysisQueue(limit = 5): Promise<ProcessSummary> {
  const store = getStore();
  const summary: ProcessSummary = { claimed: 0, completed: 0, retried: 0, failed: 0, skipped: 0 };

  // Worker-restart janitor: return jobs stuck in `processing` for too long to `pending`.
  const recovered = await store.recoverStuckJobs(120).catch(() => 0);
  if (recovered > 0) console.error(`[perf] recovered stuck jobs: ${recovered}`);

  const claimStart = performance.now();
  const jobs = await store.claimDueJobs(limit);
  summary.claimed = jobs.length;
  console.error(`[perf] claim limit=${limit} claimed=${jobs.length} ${Math.round(performance.now() - claimStart)}ms`);

  for (const job of jobs) {
    const payload = await store.getMessageForAnalysis(job.messageId);
    if (!payload) {
      // Message was deleted — close the job silently.
      await store.completeJob(job.id, job.messageId);
      summary.skipped += 1;
      continue;
    }
    const { message, context } = payload;
    const pipelineStart = performance.now();
    console.error(`[perf] classify-start messageId=${job.messageId} attempt=${job.attempts}`);
    try {
      const provider = getAIProvider();
      const result = await provider.classify({
        message: message.content,
        context: context.map((c) => ({
          sender: c.senderId === message.senderId ? "author" : "other",
          content: c.content,
        })),
        authorName: "author",
      });
      const classifiedAt = performance.now();
      console.error(
        `[perf] classify-done messageId=${job.messageId} category=${result.category} ${Math.round(
          classifiedAt - pipelineStart
        )}ms`
      );
      await store.upsertReaction(message.id, {
        category: result.category,
        confidence: result.confidence,
        provider: result.provider,
        model: result.model,
        reason: result.reason,
        language: result.language,
      });
      const savedAt = performance.now();
      await store.completeJob(job.id, message.id);
      summary.completed += 1;
      // Fire-and-forget realtime broadcast (metadata only; never blocks/breaks analysis).
      void publishReactionUpdate(message.conversationId, {
        messageId: message.id,
        category: result.category,
        confidence: result.confidence,
        provider: result.provider,
        model: result.model,
        reason: result.reason,
        language: result.language,
        createdAt: new Date().toISOString(),
      });
      console.error(
        `[perf] analysis-done messageId=${job.messageId} total=${Math.round(savedAt - pipelineStart)}ms ` +
          `classify=${Math.round(classifiedAt - pipelineStart)}ms save=${Math.round(savedAt - classifiedAt)}ms`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimited = /429/.test(message);
      const isServerError = /^(500|502|503|504)/.test(message);
      console.warn(
        `[perf] classify-failed messageId=${job.messageId} ${isRateLimited ? "RATE_LIMITED" : ""} ${
          isServerError ? "SERVER_ERROR" : ""
        }: ${message.slice(0, 200)}`
      );
      // Permanent validation errors fail immediately (no wasted retries);
      // transient provider errors honor Retry-After when supplied, else backoff+jitter.
      const forceFailed = !isRetryableError(error);
      const outcome = await store.failOrRetryJob(
        job,
        message,
        (attempt) => {
          if (error instanceof ProviderError && error.retryAfterMs) {
            return Math.min(Math.ceil(error.retryAfterMs / 1000), 120);
          }
          return Math.round(retryDelaySeconds(attempt, Math.floor(Math.random() * 500)));
        },
        forceFailed
      );
      if (outcome === "failed") summary.failed += 1;
      else summary.retried += 1;
    }
  }
  return summary;
}

/** Alias used by the cron/internal drain endpoint. */
export const drainAnalysisQueue = processAnalysisQueue;

/**
 * Hook called after message send/edit. Enqueues the job and kicks off a
 * background drain AFTER the response has been sent — delivery never waits
 * for AI. Uses Next's after() so the drain is guaranteed to run on the
 * serverless instance before it freezes, not an unstructured detached promise.
 * Safe to invoke multiple times; active jobs are deduplicated by the database.
 */
export function kickOffAnalysis(messageId: string): void {
  const run = async () => {
    await enqueueAnalysis(messageId);
    await processAnalysisQueue(5);
  };
  try {
    after(() => run().catch((err) => {
      console.error("[analysis] background drain failed", err instanceof Error ? err.message : err);
    }));
  } catch {
    // Called outside a request scope (tests/scripts): fall back to fire-and-forget.
    void run().catch((err) => {
      console.error("[analysis] background drain failed", err instanceof Error ? err.message : err);
    });
  }
}
