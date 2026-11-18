/**
 * Analysis pipeline. Messages are saved and visible immediately; classification
 * runs through the analysis_jobs queue with bounded exponential backoff.
 * Delivery never waits for AI.
 */
import { getStore } from "@/lib/server/store";
import { getAIProvider } from "./factory";

export const MAX_ATTEMPTS = 4;
export const BASE_RETRY_SECONDS = 2;

/** Exponential backoff with small deterministic jitter: 2s, 4s, 8s, 16s … */
export function retryDelaySeconds(attempt: number, jitterMs = 0): number {
  const base = BASE_RETRY_SECONDS * 2 ** Math.max(0, attempt - 1);
  return base + jitterMs / 1000;
}

/** Enqueue a job for a message (idempotent — active jobs are deduplicated). */
export async function enqueueAnalysis(messageId: string): Promise<{ jobId: string; created: boolean }> {
  const store = getStore();
  return store.enqueueAnalysisJob(messageId);
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
  const jobs = await store.claimDueJobs(limit);
  summary.claimed = jobs.length;

  for (const job of jobs) {
    const payload = await store.getMessageForAnalysis(job.messageId);
    if (!payload) {
      // Message was deleted — close the job silently.
      await store.completeJob(job.id, job.messageId);
      summary.skipped += 1;
      continue;
    }
    const { message, context } = payload;
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
      await store.upsertReaction(message.id, {
        category: result.category,
        confidence: result.confidence,
        provider: result.provider,
        model: result.model,
        reason: result.reason,
        language: result.language,
      });
      await store.completeJob(job.id, message.id);
      summary.completed += 1;
    } catch (error) {
      const outcome = await store.failOrRetryJob(
        job,
        error instanceof Error ? error.message : String(error),
        (attempt) => Math.round(retryDelaySeconds(attempt, Math.floor(Math.random() * 500)))
      );
      if (outcome === "failed") summary.failed += 1;
      else summary.retried += 1;
    }
  }
  return summary;
}

/**
 * Fire-and-forget hook called after message send/edit. Uses processAnalysisQueue
 * so send latency is never coupled to provider latency. Also exposed via
 * POST /api/analysis/process for cron/serverless environments.
 */
export function kickOffAnalysis(messageId: string): void {
  void (async () => {
    await enqueueAnalysis(messageId);
    await processAnalysisQueue(5);
  })().catch((err) => {
    console.error("[analysis] kick-off failed", err instanceof Error ? err.message : err);
  });
}
