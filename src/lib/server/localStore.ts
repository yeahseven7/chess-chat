/**
 * Local driver: embedded SQLite via node:sqlite (no native compilation needed).
 * Used for local development, unit tests and Playwright e2e when Supabase
 * environment variables are not configured.
 *
 * node:sqlite is loaded through process.getBuiltinModule so bundlers
 * (webpack/vite) don't try to resolve it as a package.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";

const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
import { LOCAL_SCHEMA } from "./schema";
import {
  AttachmentRow,
  AnalysisJobRow,
  AnalysisStatus,
  CategoryCounts,
  ConversationRow,
  ConversationStats,
  ConversationSummary,
  FriendshipRow,
  MemberRole,
  MemberRow,
  MessageRow,
  MessageSearchHit,
  MessageView,
  NotificationRow,
  ProfileRow,
  ReactionRow,
  Store,
  UserStats,
} from "./types";
import { REACTION_CATEGORIES, type ReactionCategory } from "@/shared/reactions";

// Strictly increasing timestamps — multiple writes in the same millisecond
// would otherwise collide and break created_at comparisons.
let lastTimestampMs = 0;
const now = () => {
  const t = Math.max(Date.now(), lastTimestampMs + 1);
  lastTimestampMs = t;
  return new Date(t).toISOString();
};
const newId = () => randomUUID();

type SqlRow = Record<string, any>;

const emptyCounts = (): CategoryCounts => ({
  great: 0,
  best: 0,
  excellent: 0,
  mistake: 0,
  miss: 0,
  blunder: 0,
});

const mapProfile = (r: SqlRow): ProfileRow => ({
  id: r.id,
  username: r.username,
  email: r.email ?? null,
  displayName: r.display_name,
  bio: r.bio ?? "",
  avatarColor: r.avatar_color ?? "#81b64c",
  avatarUrl: r.avatar_url ?? null,
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
});

function mapConversation(r: SqlRow): ConversationRow {
  return {
    id: r.id,
    type: r.type,
    name: r.name ?? null,
    avatarColor: r.avatar_color ?? "#4a6b8a",
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapMember(r: SqlRow): MemberRow {
  return {
    conversationId: r.conversation_id,
    userId: r.user_id,
    role: r.role,
    joinedAt: r.joined_at,
    lastReadAt: r.last_read_at,
  };
}

function mapMessage(r: SqlRow): MessageRow {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    content: r.content,
    replyToId: r.reply_to_id ?? null,
    editedAt: r.edited_at ?? null,
    deletedAt: r.deleted_at ?? null,
    analysisStatus: r.analysis_status,
    createdAt: r.created_at,
  };
}

function mapAttachment(r: SqlRow): AttachmentRow {
  return {
    id: r.id,
    messageId: r.message_id ?? null,
    uploaderId: r.uploader_id,
    kind: r.kind,
    name: r.name,
    mimeType: r.mime_type,
    size: Number(r.size),
    path: r.path,
    createdAt: r.created_at,
  };
}

function mapReaction(r: SqlRow): ReactionRow {
  return {
    messageId: r.message_id,
    conversationId: r.conversation_id ?? "",
    category: r.category,
    confidence: Number(r.confidence),
    provider: r.provider,
    model: r.model,
    reason: r.reason ?? "",
    language: r.language ?? "en",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapJob(r: SqlRow): AnalysisJobRow {
  return {
    id: r.id,
    messageId: r.message_id,
    status: r.status,
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    runAt: r.run_at,
    lastError: r.last_error ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapNotification(r: SqlRow): NotificationRow {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body ?? "",
    conversationId: r.conversation_id ?? null,
    actorId: r.actor_id ?? null,
    readAt: r.read_at ?? null,
    createdAt: r.created_at,
  };
}

function mapFriendship(r: SqlRow): FriendshipRow {
  return {
    id: r.id,
    requesterId: r.requester_id,
    addresseeId: r.addressee_id,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function computeMostCommon(counts: CategoryCounts): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const cat of REACTION_CATEGORIES) {
    if (counts[cat] > bestN) {
      bestN = counts[cat];
      best = cat;
    }
  }
  return best;
}

const POSITIVE: ReactionCategory[] = ["great", "best", "excellent"];

export class LocalStore implements Store {
  private db: NodeDatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec(LOCAL_SCHEMA);
    this.migrate();
  }

  /** Idempotent column migrations for databases created before email/auth/realtime changes. */
  private migrate() {
    const profileCols = this.all(`PRAGMA table_info(profiles)`).map((c) => String(c.name));
    if (!profileCols.includes("email")) {
      this.db.exec(`ALTER TABLE profiles ADD COLUMN email TEXT`);
    }
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email) WHERE email IS NOT NULL`);

    const reactionCols = this.all(`PRAGMA table_info(analysis_reactions)`).map((c) => String(c.name));
    if (!reactionCols.includes("conversation_id")) {
      this.db.exec(`ALTER TABLE analysis_reactions ADD COLUMN conversation_id TEXT NOT NULL DEFAULT ''`);
      this.run(`UPDATE analysis_reactions SET conversation_id = (SELECT conversation_id FROM messages WHERE messages.id = analysis_reactions.message_id) WHERE conversation_id = ''`);
    }
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_reactions_conversation ON analysis_reactions(conversation_id)`);
  }

  close() {
    this.db.close();
  }

  private one(sql: string, ...params: (string | number | null)[]): SqlRow | undefined {
    return this.db.prepare(sql).get(...params) as SqlRow | undefined;
  }

  private all(sql: string, ...params: (string | number | null)[]): SqlRow[] {
    return this.db.prepare(sql).all(...params) as SqlRow[];
  }

  private run(sql: string, ...params: (string | number | null)[]): { changes: number } {
    const res = this.db.prepare(sql).run(...params) as { changes: number | bigint };
    return { changes: Number(res.changes) };
  }

  // ── Profiles / auth ──────────────────────────────────────────
  async createProfile(input: {
    id: string;
    username: string;
    email: string | null;
    displayName: string;
    passwordHash: string;
  }): Promise<ProfileRow> {
    this.run(
      `INSERT INTO profiles (id, username, email, display_name, password_hash, created_at, last_seen_at)
       VALUES (?,?,?,?,?,?,?)`,
      input.id,
      input.username.trim(),
      input.email?.trim().toLowerCase() ?? null,
      input.displayName.trim(),
      input.passwordHash,
      now(),
      now()
    );
    return (await this.getProfileById(input.id))!;
  }

  async getProfileById(id: string): Promise<ProfileRow | null> {
    const r = this.one(`SELECT * FROM profiles WHERE id = ?`, id);
    return r ? mapProfile(r) : null;
  }

  async getProfileByUsername(username: string): Promise<ProfileRow | null> {
    const r = this.one(`SELECT * FROM profiles WHERE username = ?`, username.trim());
    return r ? mapProfile(r) : null;
  }

  async getProfileByEmail(email: string): Promise<ProfileRow | null> {
    const r = this.one(`SELECT * FROM profiles WHERE email = ?`, email.trim().toLowerCase());
    return r ? mapProfile(r) : null;
  }

  async getPasswordHash(userId: string): Promise<string | null> {
    const r = this.one(`SELECT password_hash FROM profiles WHERE id = ?`, userId);
    return r?.password_hash ?? null;
  }

  async updateProfile(
    id: string,
    patch: Partial<Pick<ProfileRow, "displayName" | "bio" | "avatarColor" | "avatarUrl">>
  ): Promise<ProfileRow | null> {
    const current = await this.getProfileById(id);
    if (!current) return null;
    this.run(
      `UPDATE profiles SET display_name = ?, bio = ?, avatar_color = ?, avatar_url = ? WHERE id = ?`,
      patch.displayName ?? current.displayName,
      patch.bio ?? current.bio,
      patch.avatarColor ?? current.avatarColor,
      patch.avatarUrl === undefined ? current.avatarUrl : patch.avatarUrl,
      id
    );
    return await this.getProfileById(id);
  }

  async touchLastSeen(id: string): Promise<void> {
    this.run(`UPDATE profiles SET last_seen_at = ? WHERE id = ?`, now(), id);
  }

  async searchProfiles(query: string, excludeId: string, limit: number): Promise<ProfileRow[]> {
    const like = `%${query.replace(/[%_]/g, "")}%`;
    return this.all(
      `SELECT * FROM profiles WHERE id != ? AND (username LIKE ? OR display_name LIKE ?)
       ORDER BY username LIMIT ?`,
      excludeId,
      like,
      like,
      limit
    ).map(mapProfile);
  }

  async suggestProfiles(excludeId: string, limit: number): Promise<ProfileRow[]> {
    return this.all(
      `SELECT p.* FROM profiles p
       WHERE p.id != ?
         AND p.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
         AND NOT EXISTS (
           SELECT 1 FROM friendships f
           WHERE (f.requester_id = ? AND f.addressee_id = p.id)
              OR (f.addressee_id = ? AND f.requester_id = p.id)
         )
       ORDER BY p.last_seen_at DESC LIMIT ?`,
      excludeId,
      excludeId,
      excludeId,
      excludeId,
      limit
    ).map(mapProfile);
  }

  // ── Blocks / reports ─────────────────────────────────────────
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    this.run(
      `INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?,?,?)`,
      blockerId,
      blockedId,
      now()
    );
    // Remove any friendship in either direction.
    this.run(
      `DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
      blockerId,
      blockedId,
      blockedId,
      blockerId
    );
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    this.run(`DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?`, blockerId, blockedId);
  }

  async isBlocked(a: string, b: string): Promise<boolean> {
    const r = this.one(
      `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1`,
      a,
      b,
      b,
      a
    );
    return !!r;
  }

  async reportUser(input: {
    reporterId: string;
    reportedId: string;
    reason: string;
    detail: string;
  }): Promise<void> {
    this.run(
      `INSERT INTO reports (id, reporter_id, reported_id, reason, detail, created_at) VALUES (?,?,?,?,?,?)`,
      newId(),
      input.reporterId,
      input.reportedId,
      input.reason.slice(0, 120),
      input.detail.slice(0, 2000),
      now()
    );
  }

  // ── Friends ──────────────────────────────────────────────────
  async listFriends(userId: string): Promise<ProfileRow[]> {
    return this.all(
      `SELECT p.* FROM profiles p
       JOIN friendships f ON f.status = 'accepted'
         AND ((f.requester_id = ? AND f.addressee_id = p.id) OR (f.addressee_id = ? AND f.requester_id = p.id))
       ORDER BY p.display_name`,
      userId,
      userId
    ).map(mapProfile);
  }

  async listFriendRequests(userId: string): Promise<{
    incoming: Array<FriendshipRow & { profile: ProfileRow }>;
    outgoing: Array<FriendshipRow & { profile: ProfileRow }>;
  }> {
    const incoming = this.all(
      `SELECT f.*, p.id AS p_id FROM friendships f JOIN profiles p ON p.id = f.requester_id
       WHERE f.addressee_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`,
      userId
    ).map((r) => ({ ...mapFriendship(r), profile: mapProfile(this.one(`SELECT * FROM profiles WHERE id = ?`, r.requester_id)!) }));
    const outgoing = this.all(
      `SELECT f.* FROM friendships f WHERE f.requester_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`,
      userId
    ).map((r) => ({ ...mapFriendship(r), profile: mapProfile(this.one(`SELECT * FROM profiles WHERE id = ?`, r.addressee_id)!) }));
    return { incoming, outgoing };
  }

  async getFriendshipBetween(a: string, b: string): Promise<FriendshipRow | null> {
    const r = this.one(
      `SELECT * FROM friendships
       WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?) LIMIT 1`,
      a,
      b,
      b,
      a
    );
    return r ? mapFriendship(r) : null;
  }

  async sendFriendRequest(
    requesterId: string,
    addresseeId: string
  ): Promise<{ friendship: FriendshipRow; autoAccepted: boolean }> {
    if (await this.isBlocked(requesterId, addresseeId)) {
      throw new Error("Cannot send friend request");
    }
    const existing = await this.getFriendshipBetween(requesterId, addresseeId);
    if (existing) {
      if (existing.status === "accepted") return { friendship: existing, autoAccepted: true };
      if (existing.status === "pending") {
        if (existing.requesterId === addresseeId) {
          // Reverse pending request → accept it.
          this.run(
            `UPDATE friendships SET status='accepted', updated_at=? WHERE id = ?`,
            now(),
            existing.id
          );
          await this.createNotification({
            userId: addresseeId,
            type: "friend_accepted",
            title: "Friend request accepted",
            body: "You are now friends.",
            actorId: requesterId,
          });
          await this.createNotification({
            userId: requesterId,
            type: "friend_accepted",
            title: "Friend request accepted",
            body: "You are now friends.",
            actorId: addresseeId,
          });
          return {
            friendship: { ...existing, status: "accepted", updatedAt: now() },
            autoAccepted: true,
          };
        }
        return { friendship: existing, autoAccepted: false };
      }
      // blocked → fall through to error
      throw new Error("Cannot send friend request");
    }
    const id = newId();
    this.run(
      `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at) VALUES (?,?,?, 'pending', ?, ?)`,
      id,
      requesterId,
      addresseeId,
      now(),
      now()
    );
    await this.createNotification({
      userId: addresseeId,
      type: "friend_request",
      title: "New friend request",
      body: "Someone wants to be your friend.",
      actorId: requesterId,
    });
    return { friendship: mapFriendship(this.one(`SELECT * FROM friendships WHERE id = ?`, id)!), autoAccepted: false };
  }

  async respondFriendRequest(
    friendshipId: string,
    userId: string,
    accept: boolean
  ): Promise<FriendshipRow | null> {
    const r = this.one(`SELECT * FROM friendships WHERE id = ?`, friendshipId);
    if (!r) return null;
    const f = mapFriendship(r);
    if (f.addresseeId !== userId || f.status !== "pending") return null;
    if (accept) {
      this.run(`UPDATE friendships SET status='accepted', updated_at=? WHERE id = ?`, now(), friendshipId);
      await this.createNotification({
        userId: f.requesterId,
        type: "friend_accepted",
        title: "Friend request accepted",
        body: "You are now friends.",
        actorId: userId,
      });
      return { ...f, status: "accepted", updatedAt: now() };
    }
    this.run(`DELETE FROM friendships WHERE id = ?`, friendshipId);
    return { ...f, status: "pending" };
  }

  async removeFriendship(userId: string, otherId: string): Promise<void> {
    this.run(
      `DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
      userId,
      otherId,
      otherId,
      userId
    );
  }

  // ── Conversations ────────────────────────────────────────────
  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const convs = this.all(
      `SELECT c.* FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
       ORDER BY c.updated_at DESC`,
      userId
    ).map(mapConversation);
    return Promise.all(convs.map((c) => this.buildSummary(c, userId)));
  }

  private async buildSummary(c: ConversationRow, userId: string): Promise<ConversationSummary> {
    const members = await this.listMembers(c.id);
    const last = this.one(
      `SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      c.id
    );
    const mine = this.one(
      `SELECT last_read_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?`,
      c.id,
      userId
    );
    const unread = this.one(
      `SELECT COUNT(*) AS n FROM messages
       WHERE conversation_id = ? AND sender_id != ? AND deleted_at IS NULL
         AND created_at > COALESCE(?, '1970-01-01')`,
      c.id,
      userId,
      mine?.last_read_at ?? null
    );
    return {
      ...c,
      members,
      lastMessage: last ? mapMessage(last) : null,
      unreadCount: Number(unread?.n ?? 0),
    };
  }

  async getConversationForUser(id: string, userId: string): Promise<ConversationRow | null> {
    const r = this.one(
      `SELECT c.* FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
       WHERE c.id = ?`,
      userId,
      id
    );
    return r ? mapConversation(r) : null;
  }

  async createDirectConversation(a: string, b: string): Promise<ConversationRow> {
    const key = `dir:${[a, b].sort().join(":")}`;
    const existing = this.one(`SELECT * FROM conversations WHERE direct_key = ?`, key);
    if (existing) return mapConversation(existing);
    const id = newId();
    const ts = now();
    this.run(
      `INSERT INTO conversations (id, type, name, avatar_color, created_by, direct_key, created_at, updated_at)
       VALUES (?, 'direct', NULL, '#4a6b8a', ?, ?, ?, ?)`,
      id,
      a,
      key,
      ts,
      ts
    );
    this.run(
      `INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?,?,?,?,?)`,
      id,
      a,
      "owner",
      ts,
      ts
    );
    this.run(
      `INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?,?,?,?,?)`,
      id,
      b,
      "member",
      ts,
      ts
    );
    return (await this.getConversationForUser(id, a))!;
  }

  async createGroup(name: string, creatorId: string, memberIds: string[]): Promise<ConversationRow> {
    const id = newId();
    const ts = now();
    const uniqueMembers = Array.from(new Set([creatorId, ...memberIds]));
    this.run(
      `INSERT INTO conversations (id, type, name, avatar_color, created_by, created_at, updated_at)
       VALUES (?, 'group', ?, '#4a6b8a', ?, ?, ?)`,
      id,
      name.trim().slice(0, 80),
      creatorId,
      ts,
      ts
    );
    for (const memberId of uniqueMembers) {
      this.run(
        `INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?,?,?,?,?)`,
        id,
        memberId,
        memberId === creatorId ? "owner" : "member",
        ts,
        ts
      );
    }
    for (const memberId of uniqueMembers) {
      if (memberId === creatorId) continue;
      await this.createNotification({
        userId: memberId,
        type: "group_invite",
        title: "Added to a group",
        body: `You were added to "${name.trim()}".`,
        conversationId: id,
        actorId: creatorId,
      });
    }
    return (await this.getConversationForUser(id, creatorId))!;
  }

  async renameConversation(id: string, name: string): Promise<void> {
    this.run(`UPDATE conversations SET name = ?, updated_at = ? WHERE id = ?`, name.trim().slice(0, 80), now(), id);
  }

  async setConversationAvatarColor(id: string, color: string): Promise<void> {
    this.run(`UPDATE conversations SET avatar_color = ?, updated_at = ? WHERE id = ?`, color, now(), id);
  }

  async listMembers(conversationId: string): Promise<Array<MemberRow & { profile: ProfileRow }>> {
    return this.all(
      `SELECT cm.*, p.id AS profile_id FROM conversation_members cm
       JOIN profiles p ON p.id = cm.user_id
       WHERE cm.conversation_id = ? ORDER BY cm.joined_at`,
      conversationId
    ).map((r) => ({
      ...mapMember(r),
      profile: mapProfile(this.one(`SELECT * FROM profiles WHERE id = ?`, r.user_id)!),
    }));
  }

  async getMemberRole(conversationId: string, userId: string): Promise<MemberRole | null> {
    const r = this.one(
      `SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?`,
      conversationId,
      userId
    );
    return (r?.role as MemberRole) ?? null;
  }

  async addGroupMember(conversationId: string, userId: string, role: MemberRole): Promise<void> {
    this.run(
      `INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?,?,?,?,?)`,
      conversationId,
      userId,
      role,
      now(),
      now()
    );
    this.run(`UPDATE conversations SET updated_at = ? WHERE id = ?`, now(), conversationId);
  }

  async removeGroupMember(conversationId: string, userId: string): Promise<void> {
    this.run(
      `DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?`,
      conversationId,
      userId
    );
  }

  async updateMemberRole(conversationId: string, userId: string, role: MemberRole): Promise<void> {
    this.run(
      `UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?`,
      role,
      conversationId,
      userId
    );
  }

  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    this.run(
      `UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?`,
      now(),
      conversationId,
      userId
    );
  }

  // ── Messages ─────────────────────────────────────────────────
  async listMessages(
    conversationId: string,
    userId: string,
    opts: { after?: string; limit?: number; query?: string }
  ): Promise<MessageView[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
    const params: (string | number)[] = [conversationId];
    let sql = `SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL`;
    if (opts.query) {
      const like = `%${opts.query.replace(/[%_]/g, "")}%`;
      sql += ` AND content LIKE ?`;
      params.push(like);
    }
    if (opts.after) {
      sql += ` AND created_at > ?`;
      params.push(opts.after);
    }
    sql += ` ORDER BY created_at ASC, rowid ASC LIMIT ?`;
    params.push(limit);
    const rows = this.all(sql, ...params).map(mapMessage);
    return Promise.all(rows.map((m) => this.toMessageView(m, userId)));
  }

  private async toMessageView(m: MessageRow, viewerId: string): Promise<MessageView> {
    const sender = m.senderId ? await this.getProfileById(m.senderId) : null;
    const replyTo = m.replyToId
      ? (this.one(`SELECT * FROM messages WHERE id = ?`, m.replyToId)
          ? mapMessage(this.one(`SELECT * FROM messages WHERE id = ?`, m.replyToId)!)
          : null)
      : null;
    const reactionRow = this.one(`SELECT * FROM analysis_reactions WHERE message_id = ?`, m.id);
    const emojiRows = this.all(
      `SELECT emoji, COUNT(*) AS n, MAX(user_id = ?) AS mine FROM emoji_reactions WHERE message_id = ? GROUP BY emoji ORDER BY emoji`,
      viewerId,
      m.id
    );
    const attachments = this.all(`SELECT * FROM attachments WHERE message_id = ?`, m.id).map(mapAttachment);
    return {
      ...m,
      sender,
      replyTo,
      reaction: reactionRow ? mapReaction(reactionRow) : null,
      emojiReactions: emojiRows.map((r) => ({
        emoji: r.emoji,
        count: Number(r.n),
        reactedByMe: !!r.mine,
      })),
      attachments,
    };
  }

  async createMessage(input: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    replyToId: string | null;
    attachmentIds: string[];
  }): Promise<MessageView | null> {
    const ts = now();
    this.run(
      `INSERT INTO messages (id, conversation_id, sender_id, content, reply_to_id, analysis_status, created_at)
       VALUES (?,?,?,?,?, 'pending', ?)`,
      input.id,
      input.conversationId,
      input.senderId,
      input.content,
      input.replyToId,
      ts
    );
    for (const attId of input.attachmentIds) {
      this.run(
        `UPDATE attachments SET message_id = ? WHERE id = ? AND uploader_id = ? AND message_id IS NULL`,
        input.id,
        attId,
        input.senderId
      );
    }
    this.run(`UPDATE conversations SET updated_at = ? WHERE id = ?`, ts, input.conversationId);
    // Notify members (not the sender) about the new message.
    const members = await this.listMembers(input.conversationId);
    for (const m of members) {
      if (m.userId === input.senderId) continue;
      await this.createNotification({
        userId: m.userId,
        type: "message",
        title: "New message",
        body: input.content.slice(0, 140),
        conversationId: input.conversationId,
        actorId: input.senderId,
      });
    }
    const row = this.one(`SELECT * FROM messages WHERE id = ?`, input.id);
    return row ? await this.toMessageView(mapMessage(row), input.senderId) : null;
  }

  async editMessage(
    messageId: string,
    userId: string,
    content: string
  ): Promise<MessageRow | null> {
    const r = this.one(`SELECT * FROM messages WHERE id = ?`, messageId);
    if (!r) return null;
    const m = mapMessage(r);
    if (m.senderId !== userId || m.deletedAt) return null;
    this.run(
      `UPDATE messages SET content = ?, edited_at = ?, analysis_status = 'pending' WHERE id = ?`,
      content,
      now(),
      messageId
    );
    // Invalidate stale classification — it will be re-analyzed.
    this.run(`DELETE FROM analysis_reactions WHERE message_id = ?`, messageId);
    return (await this.getMessageForAnalysis(messageId))?.message ?? null;
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const r = this.one(`SELECT * FROM messages WHERE id = ?`, messageId);
    if (!r) return false;
    const m = mapMessage(r);
    if (m.senderId !== userId) return false;
    this.run(
      `UPDATE messages SET deleted_at = ?, content = '', analysis_status = 'completed' WHERE id = ?`,
      now(),
      messageId
    );
    await this.invalidateReaction(messageId);
    return true;
  }

  async toggleEmojiReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    const existing = this.one(
      `SELECT 1 FROM emoji_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`,
      messageId,
      userId,
      emoji
    );
    if (existing) {
      this.run(
        `DELETE FROM emoji_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`,
        messageId,
        userId,
        emoji
      );
    } else {
      this.run(
        `INSERT INTO emoji_reactions (message_id, user_id, emoji, created_at) VALUES (?,?,?,?)`,
        messageId,
        userId,
        emoji,
        now()
      );
    }
  }

  async searchMyMessages(userId: string, query: string, limit: number): Promise<MessageSearchHit[]> {
    const like = `%${query.replace(/[%_]/g, "")}%`;
    const rows = this.all(
      `SELECT m.*, c.type AS conv_type, COALESCE(c.name, 'Direct message') AS conv_name,
              p.display_name AS sender_name
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
       JOIN profiles p ON p.id = m.sender_id
       WHERE m.deleted_at IS NULL AND m.content LIKE ?
       ORDER BY m.created_at DESC LIMIT ?`,
      userId,
      like,
      Math.min(Math.max(limit, 1), 50)
    );
    return rows.map((r) => ({
      message: mapMessage(r),
      conversationName: r.conv_name,
      conversationType: r.conv_type,
      senderName: r.sender_name,
    }));
  }

  async listSharedAttachments(conversationId: string): Promise<AttachmentRow[]> {
    return this.all(
      `SELECT a.* FROM attachments a
       JOIN messages m ON m.id = a.message_id
       WHERE m.conversation_id = ? AND m.deleted_at IS NULL
       ORDER BY a.created_at DESC LIMIT 60`,
      conversationId
    ).map(mapAttachment);
  }

  async createAttachment(input: {
    id: string;
    uploaderId: string;
    kind: "image" | "file";
    name: string;
    mimeType: string;
    size: number;
    path: string;
  }): Promise<AttachmentRow> {
    this.run(
      `INSERT INTO attachments (id, message_id, uploader_id, kind, name, mime_type, size, path, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.uploaderId,
      input.kind,
      input.name,
      input.mimeType,
      input.size,
      input.path,
      now()
    );
    return (await this.getAttachment(input.id))!;
  }

  async getAttachment(id: string): Promise<AttachmentRow | null> {
    const r = this.one(`SELECT * FROM attachments WHERE id = ?`, id);
    return r ? mapAttachment(r) : null;
  }

  async getConversationIdForMessage(messageId: string): Promise<string | null> {
    const r = this.one(`SELECT conversation_id FROM messages WHERE id = ?`, messageId);
    return r?.conversation_id ?? null;
  }

  // ── Analysis pipeline ────────────────────────────────────────
  async enqueueAnalysisJob(messageId: string): Promise<{ jobId: string; created: boolean }> {
    const id = newId();
    const res = this.run(
      `INSERT OR IGNORE INTO analysis_jobs (id, message_id, status, attempts, max_attempts, run_at, created_at, updated_at)
       VALUES (?, ?, 'pending', 0, 4, ?, ?, ?)`,
      id,
      messageId,
      now(),
      now(),
      now()
    );
    if (res.changes > 0) return { jobId: id, created: true };
    const existing = this.one(
      `SELECT id FROM analysis_jobs WHERE message_id = ? AND status IN ('pending','processing')`,
      messageId
    );
    return { jobId: existing?.id ?? id, created: false };
  }

  async claimDueJobs(limit: number): Promise<AnalysisJobRow[]> {
    const n = Math.min(Math.max(limit, 1), 25);
    const ts = now();
    const claimed = this.all(
      `UPDATE analysis_jobs
       SET status = 'processing', attempts = attempts + 1, updated_at = ?
       WHERE id IN (
         SELECT id FROM analysis_jobs
         WHERE status = 'pending' AND run_at <= ?
         ORDER BY created_at ASC LIMIT ?
       )
       RETURNING *`,
      ts,
      ts,
      n
    ).map(mapJob);
    for (const job of claimed) {
      this.run(`UPDATE messages SET analysis_status = 'processing' WHERE id = ?`, job.messageId);
    }
    return claimed;
  }

  async completeJob(jobId: string, messageId: string): Promise<void> {
    this.run(`UPDATE analysis_jobs SET status = 'completed', updated_at = ? WHERE id = ?`, now(), jobId);
    this.run(`UPDATE messages SET analysis_status = 'completed' WHERE id = ?`, messageId);
  }

  async recoverStuckJobs(staleSeconds = 120): Promise<number> {
    const ts = now();
    const cutoff =
      staleSeconds === 0 ? "9999-12-31T23:59:59.999Z" : new Date(Date.now() - staleSeconds * 1000).toISOString();
    const res = this.run(
      `UPDATE analysis_jobs SET status = 'pending', updated_at = ?
       WHERE status = 'processing' AND updated_at < ?`,
      ts,
      cutoff
    );
    if (res.changes > 0) {
      this.run(
        `UPDATE messages SET analysis_status = 'pending'
         WHERE id IN (SELECT message_id FROM analysis_jobs WHERE status = 'pending' AND updated_at = ?)`,
        ts
      );
    }
    return res.changes;
  }

  async failOrRetryJob(
    job: AnalysisJobRow,
    error: string,
    retryDelaySeconds: (attempt: number) => number,
    forceFailed = false
  ): Promise<"retry" | "failed"> {
    const trimmed = error.slice(0, 500);
    if (forceFailed || job.attempts >= job.maxAttempts) {
      this.run(
        `UPDATE analysis_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`,
        trimmed,
        now(),
        job.id
      );
      this.run(`UPDATE messages SET analysis_status = 'failed' WHERE id = ?`, job.messageId);
      return "failed";
    }
    const delay = retryDelaySeconds(job.attempts);
    this.run(
      `UPDATE analysis_jobs SET status = 'pending', last_error = ?, run_at = ?, updated_at = ? WHERE id = ?`,
      trimmed,
      new Date(Date.now() + delay * 1000).toISOString(),
      now(),
      job.id
    );
    this.run(`UPDATE messages SET analysis_status = 'pending' WHERE id = ?`, job.messageId);
    return "retry";
  }

  async getAnalysisJobForMessage(messageId: string): Promise<AnalysisJobRow | null> {
    const r = this.one(
      `SELECT * FROM analysis_jobs WHERE message_id = ? ORDER BY created_at DESC LIMIT 1`,
      messageId
    );
    return r ? mapJob(r) : null;
  }

  async requeueFailedJob(messageId: string): Promise<boolean> {
    const res = this.run(
      `UPDATE analysis_jobs SET status = 'pending', attempts = 0, run_at = ?, updated_at = ?
       WHERE message_id = ? AND status = 'failed'`,
      now(),
      now(),
      messageId
    );
    if (res.changes > 0) {
      this.run(`UPDATE messages SET analysis_status = 'pending' WHERE id = ?`, messageId);
      return true;
    }
    return false;
  }

  async upsertReaction(
    messageId: string,
    reaction: Omit<ReactionRow, "messageId" | "conversationId" | "createdAt" | "updatedAt">
  ): Promise<void> {
    const ts = now();
    // Denormalize conversation_id on the reaction row so Supabase Realtime can
    // filter updates per conversation without joins.
    const conv = this.one(`SELECT conversation_id FROM messages WHERE id = ?`, messageId);
    const conversationId = conv?.conversation_id ?? null;
    this.run(
      `INSERT INTO analysis_reactions (message_id, conversation_id, category, confidence, provider, model, reason, language, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(message_id) DO UPDATE SET
         conversation_id = excluded.conversation_id,
         category = excluded.category,
         confidence = excluded.confidence,
         provider = excluded.provider,
         model = excluded.model,
         reason = excluded.reason,
         language = excluded.language,
         updated_at = excluded.updated_at`,
      messageId,
      conversationId,
      reaction.category,
      reaction.confidence,
      reaction.provider,
      reaction.model,
      reaction.reason,
      reaction.language,
      ts,
      ts
    );
  }

  async getMessageForAnalysis(
    messageId: string
  ): Promise<{ message: MessageRow; context: MessageRow[] } | null> {
    const r = this.one(`SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL`, messageId);
    if (!r) return null;
    const message = mapMessage(r);
    const context = this.all(
      `SELECT * FROM messages WHERE conversation_id = ? AND id != ? AND deleted_at IS NULL
       ORDER BY created_at DESC, rowid DESC LIMIT 6`,
      message.conversationId,
      messageId
    )
      .map(mapMessage)
      .reverse();
    return { message, context };
  }

  async setMessageAnalysisStatus(messageId: string, status: AnalysisStatus): Promise<void> {
    this.run(`UPDATE messages SET analysis_status = ? WHERE id = ?`, status, messageId);
  }

  async invalidateReaction(messageId: string): Promise<void> {
    this.run(`DELETE FROM analysis_reactions WHERE message_id = ?`, messageId);
    this.run(
      `DELETE FROM analysis_jobs WHERE message_id = ? AND status IN ('pending','processing')`,
      messageId
    );
  }

  // ── Stats ────────────────────────────────────────────────────
  private countsForMessages(senderId: string, conversationId: string | null): CategoryCounts {
    const counts = emptyCounts();
    const params: string[] = [senderId];
    let sql = `SELECT r.category AS category, COUNT(*) AS n
       FROM analysis_reactions r
       JOIN messages m ON m.id = r.message_id
       WHERE m.sender_id = ? AND m.deleted_at IS NULL`;
    if (conversationId) {
      sql += ` AND m.conversation_id = ?`;
      params.push(conversationId);
    }
    sql += ` GROUP BY r.category`;
    for (const r of this.all(sql, ...params)) {
      if (r.category in counts) counts[r.category as ReactionCategory] = Number(r.n);
    }
    return counts;
  }

  async conversationStats(conversationId: string, viewerId: string): Promise<ConversationStats> {
    const viewer = this.countsForMessages(viewerId, conversationId);
    const peers = this.all(
      `SELECT cm.user_id, p.display_name, r.category, COUNT(*) AS n
       FROM conversation_members cm
       JOIN profiles p ON p.id = cm.user_id
       JOIN messages m ON m.sender_id = cm.user_id AND m.conversation_id = cm.conversation_id AND m.deleted_at IS NULL
       JOIN analysis_reactions r ON r.message_id = m.id
       WHERE cm.conversation_id = ? AND cm.user_id != ?
       GROUP BY cm.user_id, r.category`,
      conversationId,
      viewerId
    );
    const peer = emptyCounts();
    const perMemberMap = new Map<string, { displayName: string; counts: CategoryCounts }>();
    for (const row of peers) {
      const cat = row.category as ReactionCategory;
      if (!(cat in peer)) continue;
      peer[cat] += Number(row.n);
      const entry = perMemberMap.get(row.user_id) ?? {
        displayName: row.display_name,
        counts: emptyCounts(),
      };
      entry.counts[cat] += Number(row.n);
      perMemberMap.set(row.user_id, entry);
    }
    const combined = { ...viewer };
    for (const cat of REACTION_CATEGORIES) combined[cat] += peer[cat];
    const totalAnalyzed = REACTION_CATEGORIES.reduce((acc, c) => acc + combined[c], 0);
    const positive = POSITIVE.reduce((acc, c) => acc + combined[c], 0);
    return {
      viewer,
      peer,
      totalAnalyzed,
      mostCommon: computeMostCommon(combined),
      positive,
      negative: totalAnalyzed - positive,
      perMember: Array.from(perMemberMap.entries()).map(([userId, v]) => ({ userId, ...v })),
    };
  }

  async userStats(userId: string): Promise<UserStats> {
    const counts = this.countsForMessages(userId, null);
    const totalSent = Number(
      this.one(`SELECT COUNT(*) AS n FROM messages WHERE sender_id = ? AND deleted_at IS NULL`, userId)?.n ?? 0
    );
    const totalAnalyzed = REACTION_CATEGORIES.reduce((acc, c) => acc + counts[c], 0);
    const positive = POSITIVE.reduce((acc, c) => acc + counts[c], 0);
    return {
      counts,
      totalSent,
      totalAnalyzed,
      positive,
      negative: totalAnalyzed - positive,
      mostCommon: computeMostCommon(counts),
    };
  }

  // ── Notifications ────────────────────────────────────────────
  async createNotification(input: {
    userId: string;
    type: string;
    title: string;
    body?: string;
    conversationId?: string | null;
    actorId?: string | null;
  }): Promise<void> {
    // Aggregate duplicate "message" notifications per conversation within 5 minutes.
    if (input.type === "message" && input.conversationId) {
      const recent = this.one(
        `SELECT id FROM notifications
         WHERE user_id = ? AND type = 'message' AND conversation_id = ? AND read_at IS NULL
           AND created_at > ?`,
        input.userId,
        input.conversationId,
        new Date(Date.now() - 5 * 60 * 1000).toISOString()
      );
      if (recent) {
        this.run(`UPDATE notifications SET body = ?, created_at = ? WHERE id = ?`, input.body ?? "", now(), recent.id);
        return;
      }
    }
    this.run(
      `INSERT INTO notifications (id, user_id, type, title, body, conversation_id, actor_id, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      newId(),
      input.userId,
      input.type,
      input.title,
      input.body ?? "",
      input.conversationId ?? null,
      input.actorId ?? null,
      now()
    );
  }

  async listNotifications(userId: string, limit: number): Promise<NotificationRow[]> {
    return this.all(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      userId,
      Math.min(Math.max(limit, 1), 100)
    ).map(mapNotification);
  }

  async unreadNotificationCount(userId: string): Promise<number> {
    return Number(
      this.one(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`, userId)?.n ?? 0
    );
  }

  async markNotificationsRead(userId: string): Promise<void> {
    this.run(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`, now(), userId);
  }

  // ── Settings ─────────────────────────────────────────────────
  async getSettings(userId: string): Promise<Record<string, unknown>> {
    const r = this.one(`SELECT settings_json FROM user_settings WHERE user_id = ?`, userId);
    if (!r) return {};
    try {
      return JSON.parse(r.settings_json);
    } catch {
      return {};
    }
  }

  async updateSettings(userId: string, settings: Record<string, unknown>): Promise<void> {
    this.run(
      `INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`,
      userId,
      JSON.stringify(settings),
      now()
    );
  }
}
