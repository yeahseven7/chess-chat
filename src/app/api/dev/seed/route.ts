import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/server/auth";
import { getStore } from "@/lib/server/store";
import type { LocalStore } from "@/lib/server/localStore";

const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

export const dynamic = "force-dynamic";

/**
 * Development fixtures & Playwright resets. Enabled only when
 * ENABLE_DEV_SEED=true. Never enable in production.
 */

const SEED_USERS = [
  { username: "aisha", email: "aisha@chesschat.dev", displayName: "Aisha Bekova", bio: "Designer. Probably reading.", color: "#81b64c" },
  { username: "timur", email: "timur@chesschat.dev", displayName: "Timur Rakhimov", bio: "Backend engineer. Coffee first.", color: "#4a9ae8" },
  { username: "dana", email: "dana@chesschat.dev", displayName: "Dana Sarsenova", bio: "Product manager.", color: "#e8a33d" },
] as const;

export async function POST() {
  if (process.env.ENABLE_DEV_SEED !== "true") {
    return NextResponse.json({ error: "Seeding is disabled" }, { status: 403 });
  }
  // Reset the local database by wiping all tables (local driver only).
  const dbPath =
    process.env.LOCAL_DB_PATH ?? path.join(process.cwd(), ".localdata", "chesschat.db");
  if (fs.existsSync(dbPath)) {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      DELETE FROM notifications; DELETE FROM emoji_reactions; DELETE FROM analysis_jobs;
      DELETE FROM analysis_reactions; DELETE FROM attachments; DELETE FROM messages;
      DELETE FROM conversation_members; DELETE FROM conversations;
      DELETE FROM friendships; DELETE FROM blocks; DELETE FROM reports;
      DELETE FROM user_settings; DELETE FROM profiles;
    `);
    db.close();
  }

  const store = getStore() as unknown as LocalStore;
  const users: Awaited<ReturnType<LocalStore["createProfile"]>>[] = [];
  for (const u of SEED_USERS) {
    users.push(
      await store.createProfile({
        id: randomUUID(),
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        passwordHash: hashPassword("password123"),
      })
    );
  }
  for (const [i, u] of users.entries()) {
    await store.updateProfile(u.id, { bio: SEED_USERS[i]!.bio, avatarColor: SEED_USERS[i]!.color });
  }
  const [aisha, timur, dana] = [users[0]!, users[1]!, users[2]!];

  // Friendships: aisha↔timur accepted, aisha↔dana accepted, timur↔dana pending.
  await store.sendFriendRequest(timur.id, aisha.id);
  const f1 = await store.getFriendshipBetween(timur.id, aisha.id);
  if (f1) await store.respondFriendRequest(f1.id, aisha.id, true);
  await store.sendFriendRequest(dana.id, aisha.id);
  const f2 = await store.getFriendshipBetween(dana.id, aisha.id);
  if (f2) await store.respondFriendRequest(f2.id, aisha.id, true);
  await store.sendFriendRequest(timur.id, dana.id);

  // Direct conversation aisha↔timur with analyzed messages covering all six categories.
  const direct = await store.createDirectConversation(aisha.id, timur.id);
  const seedMessages: Array<{ sender: typeof aisha; content: string; category: string; confidence: number; reason: string }> = [
    { sender: timur, content: "Hello, how are you?", category: "excellent", confidence: 0.9, reason: "Friendly greeting." },
    { sender: aisha, content: "Thank you for helping me!", category: "best", confidence: 0.94, reason: "Supportive or appreciative message." },
    { sender: aisha, content: "That's genuinely interesting.", category: "great", confidence: 0.88, reason: "Interesting or noteworthy content." },
    { sender: timur, content: "2 + 2 = 9", category: "mistake", confidence: 0.95, reason: "Arithmetic is incorrect." },
    { sender: aisha, content: "nice weather today", category: "miss", confidence: 0.85, reason: "Off-topic reply to a question." },
    { sender: timur, content: "What the hell is this?", category: "blunder", confidence: 0.96, reason: "Contains profanity." },
  ];
  for (const s of seedMessages) {
    const msg = await store.createMessage({
      id: randomUUID(),
      conversationId: direct.id,
      senderId: s.sender.id,
      content: s.content,
      replyToId: null,
      attachmentIds: [],
    });
    if (!msg) throw new Error("Seed: failed to create message");
    await store.upsertReaction(msg.id, {
      category: s.category,
      confidence: s.confidence,
      provider: "seed",
      model: "seed-fixtures",
      reason: s.reason,
      language: "en",
    });
    await store.setMessageAnalysisStatus(msg.id, "completed");
  }

  // Group conversation with all three.
  const group = await store.createGroup("Study Group", aisha.id, [timur.id, dana.id]);
  const groupMsg = await store.createMessage({
    id: randomUUID(),
    conversationId: group.id,
    senderId: aisha.id,
    content: "Welcome to the study group!",
    replyToId: null,
    attachmentIds: [],
  });
  if (!groupMsg) throw new Error("Seed: failed to create group message");
  await store.upsertReaction(groupMsg.id, {
    category: "excellent",
    confidence: 0.9,
    provider: "seed",
    model: "seed-fixtures",
    reason: "Friendly greeting.",
    language: "en",
  });
  await store.setMessageAnalysisStatus(groupMsg.id, "completed");

  return NextResponse.json({
    ok: true,
    users: SEED_USERS.map((u) => u.email),
    password: "password123",
    directConversationId: direct.id,
    groupConversationId: group.id,
  });
}
