import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestStore } from "@/lib/server/store";
import { hashPassword } from "@/lib/server/auth";
import { REACTION_CATEGORIES } from "@/shared/reactions";
import type { ReactionCategory } from "@/shared/reactions";

async function twoUserConversation() {
  const store = createTestStore();
  const mk = (name: string) =>
    store.createProfile({
      id: randomUUID(),
      username: `${name}-${randomUUID().slice(0, 8)}`,
      email: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`,
      displayName: name,
      passwordHash: hashPassword("password123"),
    });
  const a = await mk("Alice");
  const b = await mk("Bob");
  const convo = await store.createDirectConversation(a.id, b.id);
  return { store, a, b, convo };
}

async function addClassifiedMessage(
  store: ReturnType<typeof createTestStore>,
  conversationId: string,
  senderId: string,
  category: ReactionCategory
) {
  const msg = await store.createMessage({
    id: randomUUID(),
    conversationId,
    senderId,
    content: `message about ${category} ${randomUUID().slice(0, 4)}`,
    replyToId: null,
    attachmentIds: [],
  });
  await store.upsertReaction(msg!.id, {
    category,
    confidence: 0.9,
    provider: "mock",
    model: "mock-v1",
    reason: "test",
    language: "en",
  });
  await store.setMessageAnalysisStatus(msg!.id, "completed");
  return msg!;
}

describe("conversation reaction statistics", () => {
  it("computes per-participant counts correctly", async () => {
    const { store, a, b, convo } = await twoUserConversation();
    await addClassifiedMessage(store, convo.id, a.id, "great");
    await addClassifiedMessage(store, convo.id, a.id, "best");
    await addClassifiedMessage(store, convo.id, a.id, "excellent");
    await addClassifiedMessage(store, convo.id, a.id, "mistake");
    await addClassifiedMessage(store, convo.id, b.id, "blunder");
    await addClassifiedMessage(store, convo.id, b.id, "miss");

    const stats = await store.conversationStats(convo.id, a.id);
    expect(stats.viewer).toEqual({ great: 1, best: 1, excellent: 1, mistake: 1, miss: 0, blunder: 0 });
    expect(stats.peer).toEqual({ great: 0, best: 0, excellent: 0, mistake: 0, miss: 1, blunder: 1 });
    expect(stats.totalAnalyzed).toBe(6);
    expect(stats.positive).toBe(3);
    expect(stats.negative).toBe(3);
  });

  it("reports the most common category", async () => {
    const { store, a, b, convo } = await twoUserConversation();
    await addClassifiedMessage(store, convo.id, a.id, "best");
    await addClassifiedMessage(store, convo.id, a.id, "best");
    await addClassifiedMessage(store, convo.id, b.id, "great");
    const stats = await store.conversationStats(convo.id, a.id);
    expect(stats.mostCommon).toBe("best");
  });

  it("excludes deleted messages and their reactions from stats", async () => {
    const { store, a, convo } = await twoUserConversation();
    const keep = await addClassifiedMessage(store, convo.id, a.id, "great");
    const gone = await addClassifiedMessage(store, convo.id, a.id, "blunder");
    await store.deleteMessage(gone.id, a.id);
    const stats = await store.conversationStats(convo.id, a.id);
    expect(stats.viewer.great).toBe(1);
    expect(stats.viewer.blunder).toBe(0);
    expect(stats.totalAnalyzed).toBe(1);
    expect(keep).toBeDefined();
  });

  it("handles empty conversations", async () => {
    const { store, a, convo } = await twoUserConversation();
    const stats = await store.conversationStats(convo.id, a.id);
    expect(stats.totalAnalyzed).toBe(0);
    expect(stats.mostCommon).toBeNull();
    expect(REACTION_CATEGORIES.every((c) => stats.viewer[c] === 0)).toBe(true);
  });
});

describe("per-user reaction statistics", () => {
  it("counts across conversations", async () => {
    const { store, a, b, convo } = await twoUserConversation();
    const other = await store.createDirectConversation(a.id, b.id);
    await addClassifiedMessage(store, convo.id, a.id, "best");
    await addClassifiedMessage(store, other.id, a.id, "miss");
    const stats = await store.userStats(a.id);
    expect(stats.counts.best).toBe(1);
    expect(stats.counts.miss).toBe(1);
    expect(stats.totalSent).toBe(2);
    expect(stats.totalAnalyzed).toBe(2);
  });
});
