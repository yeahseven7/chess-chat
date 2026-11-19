import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";

// No mocking of the provider factory: the real (mock) provider runs via AI_PROVIDER=mock.
import { enqueueAnalysis, processAnalysisQueue } from "@/lib/ai/pipeline";
import { getStore } from "@/lib/server/store";
import { hashPassword } from "@/lib/server/auth";

async function makeConversation() {
  const store = getStore();
  const mk = (name: string) =>
    store.createProfile({
      id: randomUUID(),
      username: `${name}-${randomUUID().slice(0, 8)}`,
      email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
      displayName: name,
      passwordHash: hashPassword("password123"),
    });
  const a = await mk("Alice");
  const b = await mk("Bob");
  const convo = await store.createDirectConversation(a.id, b.id);
  return { store, a, convo };
}

describe("provider-failure behaviour through the real queue (mock provider directives)", () => {
  it("429 → job is retried with backoff, message is never lost", async () => {
    const { store, a, convo } = await makeConversation();
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "[[fail:429]] rate limited message",
      replyToId: null,
      attachmentIds: [],
    });
    await enqueueAnalysis(msg!.id);
    const summary = await processAnalysisQueue(5);
    expect(summary.retried).toBeGreaterThanOrEqual(1);

    const job = await store.getAnalysisJobForMessage(msg!.id);
    expect(job?.status).toBe("pending");
    expect(job?.lastError).toContain("429");
    expect(new Date(job!.runAt).getTime()).toBeGreaterThan(Date.now());

    const listed = await store.listMessages(convo.id, a.id, {});
    expect(listed.find((m) => m.id === msg!.id)).toBeDefined();
  });

  it("permanent failure (non-retryable) marks the job failed immediately", async () => {
    const { store, a, convo } = await makeConversation();
    // Force a permanent failure via a blank-ish message the provider cannot parse?
    // Simplest: simulate a validation-style failure by using a message that
    // throws immediately as permanent is not possible with directives, so
    // exercise forceFailed through the store contract instead.
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "content",
      replyToId: null,
      attachmentIds: [],
    });
    await store.enqueueAnalysisJob(msg!.id);
    const claimed = await store.claimDueJobs(5);
    const job = claimed.find((j) => j.messageId === msg!.id)!;
    const outcome = await store.failOrRetryJob(job, "validation error", () => 2, true);
    expect(outcome).toBe("failed");
    const after = await store.getAnalysisJobForMessage(msg!.id);
    expect(after?.status).toBe("failed");
  });

  it("stuck processing jobs are recovered by the janitor", async () => {
    const { store, a, convo } = await makeConversation();
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "stuck job message",
      replyToId: null,
      attachmentIds: [],
    });
    await store.enqueueAnalysisJob(msg!.id);
    const claimed = await store.claimDueJobs(5);
    expect(claimed.find((j) => j.messageId === msg!.id)!.status).toBe("processing");

    // Simulate a worker that died mid-processing: with staleSeconds=0 every
    // processing job is considered abandoned and returned to the queue.
    const recovered = await store.recoverStuckJobs(0);
    expect(recovered).toBeGreaterThanOrEqual(1);
    const job = await store.getAnalysisJobForMessage(msg!.id);
    expect(job?.status).toBe("pending");
    const messages = await store.listMessages(convo.id, a.id, {});
    expect(messages.find((m) => m.id === msg!.id)?.analysisStatus).toBe("pending");
  });
});
