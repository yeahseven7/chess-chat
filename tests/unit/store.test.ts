import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestStore } from "@/lib/server/store";
import { hashPassword, verifyPassword } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rateLimit";
import { REACTION_CATEGORIES } from "@/shared/reactions";

async function twoUsers() {
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
  return { store, a, b };
}

describe("password hashing", () => {
  it("verifies correct passwords and rejects wrong ones", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(verifyPassword("", hash)).toBe(false);
  });

  it("produces different salts for identical passwords", () => {
    const h1 = hashPassword("same-password");
    const h2 = hashPassword("same-password");
    expect(h1).not.toBe(h2);
  });
});

describe("friendships", () => {
  it("auto-accepts when both users send requests", async () => {
    const { store, a, b } = await twoUsers();
    await store.sendFriendRequest(a.id, b.id);
    const { friendship, autoAccepted } = await store.sendFriendRequest(b.id, a.id);
    expect(autoAccepted).toBe(true);
    expect(friendship.status).toBe("accepted");
    expect((await store.listFriends(a.id)).map((p) => p.id)).toContain(b.id);
  });

  it("requires the addressee to accept a pending request", async () => {
    const { store, a, b } = await twoUsers();
    const { friendship } = await store.sendFriendRequest(a.id, b.id);
    expect(friendship.status).toBe("pending");
    // requester cannot self-accept
    expect(await store.respondFriendRequest(friendship.id, a.id, true)).toBeNull();
    expect(await store.respondFriendRequest(friendship.id, b.id, true)).not.toBeNull();
  });

  it("blocks friend requests when one user blocked the other", async () => {
    const { store, a, b } = await twoUsers();
    await store.blockUser(a.id, b.id);
    expect(await store.isBlocked(a.id, b.id)).toBe(true);
    expect(await store.isBlocked(b.id, a.id)).toBe(true);
    await expect(store.sendFriendRequest(b.id, a.id)).rejects.toThrow();
  });
});

describe("conversations and messages", () => {
  it("creates the same direct conversation for the same pair (idempotent)", async () => {
    const { store, a, b } = await twoUsers();
    const first = await store.createDirectConversation(a.id, b.id);
    const second = await store.createDirectConversation(b.id, a.id);
    expect(first.id).toBe(second.id);
  });

  it("tracks unread counts per member until conversation is read", async () => {
    const { store, a, b } = await twoUsers();
    const convo = await store.createDirectConversation(a.id, b.id);
    await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "hi bob",
      replyToId: null,
      attachmentIds: [],
    });
    let summary = (await store.listConversations(b.id)).find((c) => c.id === convo.id)!;
    expect(summary.unreadCount).toBe(1);
    await store.markConversationRead(convo.id, b.id);
    summary = (await store.listConversations(b.id)).find((c) => c.id === convo.id)!;
    expect(summary.unreadCount).toBe(0);
    // The sender never sees their own message as unread
    const forSender = (await store.listConversations(a.id)).find((c) => c.id === convo.id)!;
    expect(forSender.unreadCount).toBe(0);
  });

  it("lists messages in chronological order and hides deleted ones", async () => {
    const { store, a, b } = await twoUsers();
    const convo = await store.createDirectConversation(a.id, b.id);
    for (const content of ["first", "second", "third"]) {
      await store.createMessage({
        id: randomUUID(),
        conversationId: convo.id,
        senderId: a.id,
        content,
        replyToId: null,
        attachmentIds: [],
      });
    }
    let messages = await store.listMessages(convo.id, a.id, {});
    expect(messages.map((m) => m.content)).toEqual(["first", "second", "third"]);
    await store.deleteMessage(messages[1]!.id, a.id);
    messages = await store.listMessages(convo.id, a.id, {});
    expect(messages.map((m) => m.content)).toEqual(["first", "third"]);
  });

  it("search finds messages only inside the user's conversations", async () => {
    const { store, a, b } = await twoUsers();
    const convo = await store.createDirectConversation(a.id, b.id);
    await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "uniquekeyword in this message",
      replyToId: null,
      attachmentIds: [],
    });
    const hits = await store.searchMyMessages(a.id, "uniquekeyword", 10);
    expect(hits).toHaveLength(1);
    expect(await store.searchMyMessages(a.id, "nomatchxyz", 10)).toHaveLength(0);
  });

  it("toggles emoji reactions on and off", async () => {
    const { store, a, b } = await twoUsers();
    const convo = await store.createDirectConversation(a.id, b.id);
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: convo.id,
      senderId: a.id,
      content: "react to me",
      replyToId: null,
      attachmentIds: [],
    });
    await store.toggleEmojiReaction(msg!.id, b.id, "👍");
    let view = (await store.listMessages(convo.id, b.id, {}))[0]!;
    expect(view.emojiReactions).toEqual([{ emoji: "👍", count: 1, reactedByMe: true }]);
    await store.toggleEmojiReaction(msg!.id, b.id, "👍");
    view = (await store.listMessages(convo.id, b.id, {}))[0]!;
    expect(view.emojiReactions).toHaveLength(0);
  });

  it("creates group conversations with an owner and notifies invited members", async () => {
    const { store, a, b } = await twoUsers();
    const group = await store.createGroup("Study Group", a.id, [b.id]);
    expect(group.type).toBe("group");
    expect(await store.getMemberRole(group.id, a.id)).toBe("owner");
    expect(await store.getMemberRole(group.id, b.id)).toBe("member");
    const notifs = await store.listNotifications(b.id, 10);
    expect(notifs.some((n) => n.type === "group_invite")).toBe(true);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit, then rejects", () => {
    const key = `test-${randomUUID()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60).allowed).toBe(true);
    }
    expect(rateLimit(key, 5, 60).allowed).toBe(false);
  });
});

describe("reaction categories", () => {
  it("exposes exactly six categories", () => {
    expect(REACTION_CATEGORIES).toEqual([
      "great",
      "best",
      "excellent",
      "mistake",
      "miss",
      "blunder",
    ]);
  });
});
