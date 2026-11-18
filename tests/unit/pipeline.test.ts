import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";

const classifyMock = vi.fn();
vi.mock("@/lib/ai/factory", () => ({
  getAIProvider: () => ({
    name: "mock",
    model: "mock-v1",
    classify: classifyMock,
  }),
}));

// Imported after vi.mock — factory is stubbed.
import { enqueueAnalysis, processAnalysisQueue, retryDelaySeconds } from "@/lib/ai/pipeline";
import { getStore } from "@/lib/server/store";
import { hashPassword } from "@/lib/server/auth";

async function makeConversation() {
  const store = getStore();
  const a = await store.createProfile({
    id: randomUUID(),
    username: `a-${randomUUID().slice(0, 8)}`,
    displayName: "Alice",
    passwordHash: hashPassword("password123"),
  });
  const b = await store.createProfile({
    id: randomUUID(),
    username: `b-${randomUUID().slice(0, 8)}`,
    displayName: "Bob",
    passwordHash: hashPassword("password123"),
  });
  const convo = await store.createDirectConversation(a.id, b.id);
  return { store, a, b, convo };
}

describe("retry backoff", () => {
  it("grows exponentially", () => {
    expect(retryDelaySeconds(1)).toBe(2);
    expect(retryDelaySeconds(2)).toBe(4);
    expect(retryDelaySeconds(3)).toBe(8);
    expect(retryDelaySeconds(4)).toBe(16);
  });
});

describe("analysis pipeline", () => {
  beforeEach(() => {
    classifyMock.mockReset();
  });

  it("classifies a message successfully and stores the reaction", async () => {
    classifyMock.mockResolvedValue({
      category: "best",
      confidence: 0.93,
      reason: "supportive",
      language: "en",
      provider: "mock",
      model: "mock-v1",
    });
    const { store, a, convo } = await makeConversation();
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "Thank you for helping me!",
      replyToId: null,
      attachmentIds: [],
    });
    const { jobId, created } = await enqueueAnalysis(msg!.id);
    expect(created).toBe(true);
    const summary = await processAnalysisQueue(5);
    expect(summary.completed).toBeGreaterThanOrEqual(1);

    const listed = await store.listMessages(convo.id, a.id, {});
    const found = listed.find((m) => m.id === msg!.id);
    expect(found?.analysisStatus).toBe("completed");
    expect(found?.reaction?.category).toBe("best");
    expect(found?.reaction?.provider).toBe("mock");

    const job = await store.getAnalysisJobForMessage(msg!.id);
    expect(job?.status).toBe("completed");
  });

  it("prevents duplicate analysis jobs for the same message", async () => {
    const { store, a, convo } = await makeConversation();
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "Hello, how are you?",
      replyToId: null,
      attachmentIds: [],
    });
    const first = await store.enqueueAnalysisJob(msg!.id);
    const second = await store.enqueueAnalysisJob(msg!.id);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.jobId).toBe(first.jobId);
  });

  it("backs off and retries a failed provider, then fails permanently after max attempts", async () => {
    classifyMock.mockRejectedValue(new Error("provider exploded"));
    const { store, a, convo } = await makeConversation();
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "Hello, how are you?",
      replyToId: null,
      attachmentIds: [],
    });
    await store.enqueueAnalysisJob(msg!.id);

    const claimed = await store.claimDueJobs(10);
    const job = claimed.find((j) => j.messageId === msg!.id)!;
    expect(job).toBeDefined();

    // Simulate attempts exhausting the budget
    const exhausted = { ...job, attempts: job.maxAttempts };
    const outcome = await store.failOrRetryJob(exhausted, "boom", retryDelaySeconds);
    expect(outcome).toBe("failed");
    const after = await store.getAnalysisJobForMessage(msg!.id);
    expect(after?.status).toBe("failed");

    // Failed jobs can be requeued
    expect(await store.requeueFailedJob(msg!.id)).toBe(true);
    const requeued = await store.getAnalysisJobForMessage(msg!.id);
    expect(requeued?.status).toBe("pending");
    expect(requeued?.attempts).toBe(0);
  });

  it("gives an earlier job a future run_at when it fails", async () => {
    const { store, a, convo } = await makeConversation();
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "Hello, how are you?",
      replyToId: null,
      attachmentIds: [],
    });
    await store.enqueueAnalysisJob(msg!.id);
    const claimed = await store.claimDueJobs(10);
    const job = claimed.find((j) => j.messageId === msg!.id)!;
    const outcome = await store.failOrRetryJob(job, "boom", () => 30);
    expect(outcome).toBe("retry");
    const after = await store.getAnalysisJobForMessage(msg!.id);
    expect(after?.status).toBe("pending");
    expect(new Date(after!.runAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("editing a message deletes the old reaction and re-enqueues analysis", async () => {
    classifyMock.mockResolvedValue({
      category: "best",
      confidence: 0.9,
      reason: "supportive",
      language: "en",
      provider: "mock",
      model: "mock-v1",
    });
    const { store, a, convo } = await makeConversation();
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "Thank you for helping me!",
      replyToId: null,
      attachmentIds: [],
    });
    await enqueueAnalysis(msg!.id);
    await processAnalysisQueue(5);
    let listed = await store.listMessages(convo.id, a.id, {});
    expect(listed[0]?.reaction?.category).toBe("best");

    await store.editMessage(msg!.id, a.id, "Hello, how are you?");
    listed = await store.listMessages(convo.id, a.id, {});
    expect(listed[0]?.reaction).toBeNull();
    expect(listed[0]?.analysisStatus).toBe("pending");

    // Re-enqueue and process — category should reflect the new content
    classifyMock.mockResolvedValue({
      category: "excellent",
      confidence: 0.9,
      reason: "greeting",
      language: "en",
      provider: "mock",
      model: "mock-v1",
    });
    await enqueueAnalysis(msg!.id);
    await processAnalysisQueue(5);
    listed = await store.listMessages(convo.id, a.id, {});
    expect(listed[0]?.reaction?.category).toBe("excellent");
  });

  it("completes jobs for deleted messages without calling the provider", async () => {
    classifyMock.mockClear();
    const { store, a, convo } = await makeConversation();
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "soon to be deleted",
      replyToId: null,
      attachmentIds: [],
    });
    await store.enqueueAnalysisJob(msg!.id);
    await store.deleteMessage(msg!.id, a.id);
    await processAnalysisQueue(5);
    // The pending job is invalidated with the message; the provider is never called.
    expect(classifyMock).not.toHaveBeenCalled();
    expect(await store.listMessages(convo.id, a.id, {})).toHaveLength(0);
  });
});
