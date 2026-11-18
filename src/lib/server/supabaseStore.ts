/**
 * Supabase driver — mirrors LocalStore semantics against PostgreSQL via the
 * Supabase service-role key. Server-side only. Membership/ownership checks are
 * enforced in code (the same rules as the local driver); RLS policies in
 * supabase/migrations/0001_init.sql are the second line of defense for any
 * direct PostgREST access.
 *
 * NOTE: This driver compiles and follows the supabase-js API, but it has NOT
 * been executed against a live Supabase project in this environment.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type {
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

const now = () => new Date().toISOString();
const newId = () => randomUUID();

type Row = Record<string, any>;

const emptyCounts = (): CategoryCounts => ({
  great: 0,
  best: 0,
  excellent: 0,
  mistake: 0,
  miss: 0,
  blunder: 0,
});

const mapProfile = (r: Row): ProfileRow => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  bio: r.bio ?? "",
  avatarColor: r.avatar_color ?? "#81b64c",
  avatarUrl: r.avatar_url ?? null,
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
});
const mapConversation = (r: Row): ConversationRow => ({
  id: r.id,
  type: r.type,
  name: r.name ?? null,
  avatarColor: r.avatar_color ?? "#4a6b8a",
  createdBy: r.created_by ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapMember = (r: Row): MemberRow => ({
  conversationId: r.conversation_id,
  userId: r.user_id,
  role: r.role,
  joinedAt: r.joined_at,
  lastReadAt: r.last_read_at,
});
const mapMessage = (r: Row): MessageRow => ({
  id: r.id,
  conversationId: r.conversation_id,
  senderId: r.sender_id,
  content: r.content,
  replyToId: r.reply_to_id ?? null,
  editedAt: r.edited_at ?? null,
  deletedAt: r.deleted_at ?? null,
  analysisStatus: r.analysis_status,
  createdAt: r.created_at,
});
const mapAttachment = (r: Row): AttachmentRow => ({
  id: r.id,
  messageId: r.message_id ?? null,
  uploaderId: r.uploader_id,
  kind: r.kind,
  name: r.name,
  mimeType: r.mime_type,
  size: Number(r.size),
  path: r.path,
  createdAt: r.created_at,
});
const mapReaction = (r: Row): ReactionRow => ({
  messageId: r.message_id,
  category: r.category,
  confidence: Number(r.confidence),
  provider: r.provider,
  model: r.model,
  reason: r.reason ?? "",
  language: r.language ?? "en",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapJob = (r: Row): AnalysisJobRow => ({
  id: r.id,
  messageId: r.message_id,
  status: r.status,
  attempts: Number(r.attempts),
  maxAttempts: Number(r.max_attempts),
  runAt: r.run_at,
  lastError: r.last_error ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapNotification = (r: Row): NotificationRow => ({
  id: r.id,
  userId: r.user_id,
  type: r.type,
  title: r.title,
  body: r.body ?? "",
  conversationId: r.conversation_id ?? null,
  actorId: r.actor_id ?? null,
  readAt: r.read_at ?? null,
  createdAt: r.created_at,
});
const mapFriendship = (r: Row): FriendshipRow => ({
  id: r.id,
  requesterId: r.requester_id,
  addresseeId: r.addressee_id,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const POSITIVE: ReactionCategory[] = ["great", "best", "excellent"];
const computeMostCommon = (counts: CategoryCounts): string | null => {
  let best: string | null = null;
  let bestN = 0;
  for (const cat of REACTION_CATEGORIES) {
    if (counts[cat] > bestN) {
      bestN = counts[cat];
      best = cat;
    }
  }
  return best;
};

export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private async unwrap<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
    const { data, error } = await q;
    if (error) {
      const message = (error as { message?: string } | null)?.message ?? "Supabase error";
      throw new Error(message);
    }
    return data as T;
  }

  // ── Profiles / auth ──────────────────────────────────────────
  async createProfile(input: {
    id: string;
    username: string;
    displayName: string;
    passwordHash: string;
  }): Promise<ProfileRow> {
    const data = await this.unwrap<Row[]>(
      this.db
        .from("profiles")
        .insert({
          id: input.id,
          username: input.username.trim(),
          display_name: input.displayName.trim(),
          password_hash: input.passwordHash,
          created_at: now(),
          last_seen_at: now(),
        })
        .select()
    );
    return mapProfile(data[0]!);
  }

  async getProfileById(id: string): Promise<ProfileRow | null> {
    const { data } = await this.db.from("profiles").select("*").eq("id", id).maybeSingle();
    return data ? mapProfile(data) : null;
  }

  async getProfileByUsername(username: string): Promise<ProfileRow | null> {
    const { data } = await this.db.from("profiles").select("*").ilike("username", username.trim()).maybeSingle();
    return data ? mapProfile(data) : null;
  }

  async getPasswordHash(userId: string): Promise<string | null> {
    const { data } = await this.db.from("profiles").select("password_hash").eq("id", userId).maybeSingle();
    return data?.password_hash ?? null;
  }

  async updateProfile(
    id: string,
    patch: Partial<Pick<ProfileRow, "displayName" | "bio" | "avatarColor" | "avatarUrl">>
  ): Promise<ProfileRow | null> {
    const update: Row = {};
    if (patch.displayName !== undefined) update.display_name = patch.displayName;
    if (patch.bio !== undefined) update.bio = patch.bio;
    if (patch.avatarColor !== undefined) update.avatar_color = patch.avatarColor;
    if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;
    const data = await this.unwrap<Row[]>(this.db.from("profiles").update(update).eq("id", id).select());
    return data[0] ? mapProfile(data[0]) : null;
  }

  async touchLastSeen(id: string): Promise<void> {
    await this.db.from("profiles").update({ last_seen_at: now() }).eq("id", id);
  }

  async searchProfiles(query: string, excludeId: string, limit: number): Promise<ProfileRow[]> {
    const like = `%${query.replace(/[%_]/g, "")}%`;
    const data = await this.unwrap<Row[]>(
      this.db
        .from("profiles")
        .select("*")
        .neq("id", excludeId)
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .order("username")
        .limit(limit)
    );
    return data.map(mapProfile);
  }

  async suggestProfiles(excludeId: string, limit: number): Promise<ProfileRow[]> {
    // Profiles not already in a friendship with or blocking the user.
    const friends = await this.unwrap<Row[]>(
      this.db.from("friendships").select("requester_id, addressee_id")
        .or(`requester_id.eq.${excludeId},addressee_id.eq.${excludeId}`)
    );
    const excluded = new Set<string>([excludeId]);
    for (const f of friends) {
      excluded.add(f.requester_id);
      excluded.add(f.addressee_id);
    }
    const blocks = await this.unwrap<Row[]>(
      this.db.from("blocks").select("blocked_id").eq("blocker_id", excludeId)
    );
    for (const b of blocks) excluded.add(b.blocked_id);
    const data = await this.unwrap<Row[]>(
      this.db.from("profiles").select("*").not("id", "in", `(${[...excluded].map((id) => `"${id}"`).join(",")})`)
        .order("last_seen_at", { ascending: false })
        .limit(limit)
    );
    return data.map(mapProfile);
  }

  // ── Blocks / reports ─────────────────────────────────────────
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    await this.db.from("blocks").upsert({ blocker_id: blockerId, blocked_id: blockedId, created_at: now() });
    await this.db.from("friendships").delete()
      .or(`and(requester_id.eq.${blockerId},addressee_id.eq.${blockedId}),and(requester_id.eq.${blockedId},addressee_id.eq.${blockerId})`);
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await this.db.from("blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
  }

  async isBlocked(a: string, b: string): Promise<boolean> {
    const { data } = await this.db
      .from("blocks")
      .select("blocker_id")
      .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  async reportUser(input: { reporterId: string; reportedId: string; reason: string; detail: string }): Promise<void> {
    await this.db.from("reports").insert({
      id: newId(),
      reporter_id: input.reporterId,
      reported_id: input.reportedId,
      reason: input.reason.slice(0, 120),
      detail: input.detail.slice(0, 2000),
      created_at: now(),
    });
  }

  // ── Friends ──────────────────────────────────────────────────
  async listFriends(userId: string): Promise<ProfileRow[]> {
    const rels = await this.unwrap<Row[]>(
      this.db.from("friendships").select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    );
    const ids = rels.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    if (ids.length === 0) return [];
    return this.unwrap<Row[]>(
      this.db.from("profiles").select("*").in("id", ids).order("display_name")
    ).then((rows) => rows.map(mapProfile));
  }

  async listFriendRequests(userId: string): Promise<{
    incoming: Array<FriendshipRow & { profile: ProfileRow }>;
    outgoing: Array<FriendshipRow & { profile: ProfileRow }>;
  }> {
    const [incoming, outgoing] = await Promise.all([
      this.unwrap<Row[]>(
        this.db.from("friendships").select("*, requester:profiles!requester_id(*)")
          .eq("addressee_id", userId).eq("status", "pending").order("created_at", { ascending: false })
      ),
      this.unwrap<Row[]>(
        this.db.from("friendships").select("*, addressee:profiles!addressee_id(*)")
          .eq("requester_id", userId).eq("status", "pending").order("created_at", { ascending: false })
      ),
    ]);
    return {
      incoming: incoming.map((r) => ({
        ...mapFriendship(r),
        profile: mapProfile(r.requester),
      })),
      outgoing: outgoing.map((r) => ({
        ...mapFriendship(r),
        profile: mapProfile(r.addressee),
      })),
    };
  }

  async getFriendshipBetween(a: string, b: string): Promise<FriendshipRow | null> {
    const { data } = await this.db
      .from("friendships")
      .select("*")
      .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
      .maybeSingle();
    return data ? mapFriendship(data) : null;
  }

  async sendFriendRequest(
    requesterId: string,
    addresseeId: string
  ): Promise<{ friendship: FriendshipRow; autoAccepted: boolean }> {
    const existing = await this.getFriendshipBetween(requesterId, addresseeId);
    if (existing) {
      if (existing.status === "accepted") return { friendship: existing, autoAccepted: true };
      if (existing.status === "pending") {
        if (existing.requesterId === addresseeId) {
          const data = await this.unwrap<Row[]>(
            this.db.from("friendships").update({ status: "accepted", updated_at: now() }).eq("id", existing.id).select()
          );
          this.createNotification({ userId: addresseeId, type: "friend_accepted", title: "Friend request accepted", body: "You are now friends.", actorId: requesterId });
          this.createNotification({ userId: requesterId, type: "friend_accepted", title: "Friend request accepted", body: "You are now friends.", actorId: addresseeId });
          return { friendship: mapFriendship(data[0]!), autoAccepted: true };
        }
        return { friendship: existing, autoAccepted: false };
      }
      throw new Error("Cannot send friend request");
    }
    const id = newId();
    const data = await this.unwrap<Row[]>(
      this.db.from("friendships")
        .insert({ id, requester_id: requesterId, addressee_id: addresseeId, status: "pending", created_at: now(), updated_at: now() })
        .select()
    );
    this.createNotification({ userId: addresseeId, type: "friend_request", title: "New friend request", body: "Someone wants to be your friend.", actorId: requesterId });
    return { friendship: mapFriendship(data[0]!), autoAccepted: false };
  }

  async respondFriendRequest(
    friendshipId: string,
    userId: string,
    accept: boolean
  ): Promise<FriendshipRow | null> {
    const { data: found } = await this.db.from("friendships").select("*").eq("id", friendshipId).maybeSingle();
    if (!found) return null;
    const f = mapFriendship(found);
    if (f.addresseeId !== userId || f.status !== "pending") return null;
    if (accept) {
      const data = await this.unwrap<Row[]>(
        this.db.from("friendships").update({ status: "accepted", updated_at: now() }).eq("id", friendshipId).select()
      );
      this.createNotification({ userId: f.requesterId, type: "friend_accepted", title: "Friend request accepted", body: "You are now friends.", actorId: userId });
      return mapFriendship(data[0]!);
    }
    await this.db.from("friendships").delete().eq("id", friendshipId);
    return { ...f, status: "pending" };
  }

  async removeFriendship(userId: string, otherId: string): Promise<void> {
    await this.db.from("friendships").delete()
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${userId})`);
  }

  // ── Conversations ────────────────────────────────────────────
  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const memberships = await this.unwrap<Row[]>(
      this.db.from("conversation_members").select("conversation_id, last_read_at").eq("user_id", userId)
    );
    const convIds = memberships.map((m) => m.conversation_id);
    if (convIds.length === 0) return [];
    const convs = await this.unwrap<Row[]>(
      this.db.from("conversations").select("*").in("id", convIds).order("updated_at", { ascending: false })
    );
    const lastRead = new Map(memberships.map((m) => [m.conversation_id, m.last_read_at]));
    return Promise.all(
      convs.map(async (c) => {
        const conv = mapConversation(c);
        const members = await this.listMembers(conv.id);
        const { data: last } = await this.db
          .from("messages").select("*").eq("conversation_id", conv.id).is("deleted_at", null)
          .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
        const { count } = await this.db
          .from("messages").select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id).neq("sender_id", userId).is("deleted_at", null)
          .gt("created_at", lastRead.get(conv.id) ?? "1970-01-01");
        return { ...conv, members, lastMessage: last ? mapMessage(last) : null, unreadCount: count ?? 0 };
      })
    );
  }

  async getConversationForUser(id: string, userId: string): Promise<ConversationRow | null> {
    const { data } = await this.db
      .from("conversations")
      .select("*, conversation_members!inner(user_id)")
      .eq("id", id)
      .eq("conversation_members.user_id", userId)
      .maybeSingle();
    return data ? mapConversation(data) : null;
  }

  async createDirectConversation(a: string, b: string): Promise<ConversationRow> {
    const key = `dir:${[a, b].sort().join(":")}`;
    const { data: existing } = await this.db.from("conversations").select("*").eq("direct_key", key).maybeSingle();
    if (existing) return mapConversation(existing);
    const id = newId();
    const ts = now();
    const conv = await this.unwrap<Row[]>(
      this.db.from("conversations")
        .insert({ id, type: "direct", name: null, avatar_color: "#4a6b8a", created_by: a, direct_key: key, created_at: ts, updated_at: ts })
        .select()
    );
    await this.db.from("conversation_members").insert([
      { conversation_id: id, user_id: a, role: "owner", joined_at: ts, last_read_at: ts },
      { conversation_id: id, user_id: b, role: "member", joined_at: ts, last_read_at: ts },
    ]);
    return mapConversation(conv[0]!);
  }

  async createGroup(name: string, creatorId: string, memberIds: string[]): Promise<ConversationRow> {
    const id = newId();
    const ts = now();
    const uniqueMembers = Array.from(new Set([creatorId, ...memberIds]));
    const conv = await this.unwrap<Row[]>(
      this.db.from("conversations")
        .insert({ id, type: "group", name: name.trim().slice(0, 80), avatar_color: "#4a6b8a", created_by: creatorId, created_at: ts, updated_at: ts })
        .select()
    );
    await this.db.from("conversation_members").insert(
      uniqueMembers.map((memberId) => ({
        conversation_id: id,
        user_id: memberId,
        role: memberId === creatorId ? "owner" : "member",
        joined_at: ts,
        last_read_at: ts,
      }))
    );
    for (const memberId of uniqueMembers) {
      if (memberId === creatorId) continue;
      this.createNotification({ userId: memberId, type: "group_invite", title: "Added to a group", body: `You were added to "${name.trim()}".`, conversationId: id, actorId: creatorId });
    }
    return mapConversation(conv[0]!);
  }

  async renameConversation(id: string, name: string): Promise<void> {
    await this.db.from("conversations").update({ name: name.trim().slice(0, 80), updated_at: now() }).eq("id", id);
  }

  async setConversationAvatarColor(id: string, color: string): Promise<void> {
    await this.db.from("conversations").update({ avatar_color: color, updated_at: now() }).eq("id", id);
  }

  async listMembers(conversationId: string): Promise<Array<MemberRow & { profile: ProfileRow }>> {
    const data = await this.unwrap<Row[]>(
      this.db.from("conversation_members").select("*, profile:profiles(*)").eq("conversation_id", conversationId).order("joined_at")
    );
    return data.map((r) => ({ ...mapMember(r), profile: mapProfile(r.profile) }));
  }

  async getMemberRole(conversationId: string, userId: string): Promise<MemberRole | null> {
    const { data } = await this.db
      .from("conversation_members").select("role").eq("conversation_id", conversationId).eq("user_id", userId).maybeSingle();
    return (data?.role as MemberRole) ?? null;
  }

  async addGroupMember(conversationId: string, userId: string, role: MemberRole): Promise<void> {
    await this.db.from("conversation_members").upsert({
      conversation_id: conversationId,
      user_id: userId,
      role,
      joined_at: now(),
      last_read_at: now(),
    });
    await this.db.from("conversations").update({ updated_at: now() }).eq("id", conversationId);
  }

  async removeGroupMember(conversationId: string, userId: string): Promise<void> {
    await this.db.from("conversation_members").delete().eq("conversation_id", conversationId).eq("user_id", userId);
  }

  async updateMemberRole(conversationId: string, userId: string, role: MemberRole): Promise<void> {
    await this.db.from("conversation_members").update({ role }).eq("conversation_id", conversationId).eq("user_id", userId);
  }

  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    await this.db.from("conversation_members").update({ last_read_at: now() }).eq("conversation_id", conversationId).eq("user_id", userId);
  }

  // ── Messages ─────────────────────────────────────────────────
  async listMessages(
    conversationId: string,
    userId: string,
    opts: { after?: string; limit?: number; query?: string }
  ): Promise<MessageView[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
    let q = this.db
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    if (opts.after) q = q.gt("created_at", opts.after);
    if (opts.query) q = q.ilike("content", `%${opts.query.replace(/[%_]/g, "")}%`);
    const data = await this.unwrap<Row[]>(q);
    return Promise.all(data.map((r) => this.toMessageView(mapMessage(r), userId)));
  }

  private async toMessageView(m: MessageRow, viewerId: string): Promise<MessageView> {
    const [sender, replyTo, reaction, emojiRows, attachments] = await Promise.all([
      m.senderId ? this.getProfileById(m.senderId) : Promise.resolve(null),
      m.replyToId
        ? this.db.from("messages").select("*").eq("id", m.replyToId).maybeSingle().then(({ data }) => (data ? mapMessage(data) : null))
        : Promise.resolve(null),
      this.db.from("analysis_reactions").select("*").eq("message_id", m.id).maybeSingle().then(({ data }) => (data ? mapReaction(data) : null)),
      this.unwrap<Row[]>(this.db.from("emoji_reactions").select("emoji, user_id").eq("message_id", m.id)),
      this.unwrap<Row[]>(this.db.from("attachments").select("*").eq("message_id", m.id)),
    ]);
    const grouped = new Map<string, { count: number; mine: boolean }>();
    for (const r of emojiRows) {
      const entry = grouped.get(r.emoji) ?? { count: 0, mine: false };
      entry.count += 1;
      if (r.user_id === viewerId) entry.mine = true;
      grouped.set(r.emoji, entry);
    }
    return {
      ...m,
      sender,
      replyTo,
      reaction,
      emojiReactions: [...grouped.entries()].map(([emoji, v]) => ({
        emoji,
        count: v.count,
        reactedByMe: v.mine,
      })),
      attachments: attachments.map(mapAttachment),
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
    const data = await this.unwrap<Row[]>(
      this.db.from("messages")
        .insert({ id: input.id, conversation_id: input.conversationId, sender_id: input.senderId, content: input.content, reply_to_id: input.replyToId, analysis_status: "pending", created_at: ts })
        .select()
    );
    if (!data[0]) return null;
    if (input.attachmentIds.length > 0) {
      await this.db.from("attachments").update({ message_id: input.id })
        .in("id", input.attachmentIds).eq("uploader_id", input.senderId).is("message_id", null);
    }
    await this.db.from("conversations").update({ updated_at: ts }).eq("id", input.conversationId);
    const members = await this.listMembers(input.conversationId);
    for (const m of members) {
      if (m.userId === input.senderId) continue;
      this.createNotification({ userId: m.userId, type: "message", title: "New message", body: input.content.slice(0, 140), conversationId: input.conversationId, actorId: input.senderId });
    }
    return this.toMessageView(mapMessage(data[0]), input.senderId);
  }

  async editMessage(messageId: string, userId: string, content: string): Promise<MessageRow | null> {
    const { data } = await this.db.from("messages").select("*").eq("id", messageId).maybeSingle();
    if (!data) return null;
    const m = mapMessage(data);
    if (m.senderId !== userId || m.deletedAt) return null;
    await this.db.from("messages").update({ content, edited_at: now(), analysis_status: "pending" }).eq("id", messageId);
    await this.db.from("analysis_reactions").delete().eq("message_id", messageId);
    const { data: updated } = await this.db.from("messages").select("*").eq("id", messageId).single();
    return mapMessage(updated!);
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const { data } = await this.db.from("messages").select("sender_id").eq("id", messageId).maybeSingle();
    if (!data || data.sender_id !== userId) return false;
    await this.db.from("messages").update({ deleted_at: now(), content: "", analysis_status: "completed" }).eq("id", messageId);
    await this.invalidateReaction(messageId);
    return true;
  }

  async toggleEmojiReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    const { data } = await this.db.from("emoji_reactions").select("message_id").eq("message_id", messageId).eq("user_id", userId).eq("emoji", emoji).maybeSingle();
    if (data) {
      await this.db.from("emoji_reactions").delete().eq("message_id", messageId).eq("user_id", userId).eq("emoji", emoji);
    } else {
      await this.db.from("emoji_reactions").insert({ message_id: messageId, user_id: userId, emoji, created_at: now() });
    }
  }

  async searchMyMessages(userId: string, query: string, limit: number): Promise<MessageSearchHit[]> {
    const like = `%${query.replace(/[%_]/g, "")}%`;
    const { data, error } = await this.db
      .from("messages")
      .select("*, conversation:conversations!inner(type, name, conversation_members!inner(user_id)), sender:profiles!sender_id(display_name)")
      .eq("conversation.conversation_members.user_id", userId)
      .is("deleted_at", null)
      .ilike("content", like)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Row) => ({
      message: mapMessage(r),
      conversationName: r.conversation?.name ?? "Direct message",
      conversationType: r.conversation?.type ?? "direct",
      senderName: r.sender?.display_name ?? "",
    }));
  }

  async listSharedAttachments(conversationId: string): Promise<AttachmentRow[]> {
    const messageIds = await this.unwrap<Row[]>(
      this.db.from("messages").select("id").eq("conversation_id", conversationId).is("deleted_at", null)
    );
    const ids = messageIds.map((m) => m.id);
    if (ids.length === 0) return [];
    const data = await this.unwrap<Row[]>(
      this.db.from("attachments").select("*").in("message_id", ids).order("created_at", { ascending: false }).limit(60)
    );
    return data.map(mapAttachment);
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
    const data = await this.unwrap<Row[]>(
      this.db.from("attachments")
        .insert({ id: input.id, message_id: null, uploader_id: input.uploaderId, kind: input.kind, name: input.name, mime_type: input.mimeType, size: input.size, path: input.path, created_at: now() })
        .select()
    );
    return mapAttachment(data[0]!);
  }

  async getAttachment(id: string): Promise<AttachmentRow | null> {
    const { data } = await this.db.from("attachments").select("*").eq("id", id).maybeSingle();
    return data ? mapAttachment(data) : null;
  }

  async getConversationIdForMessage(messageId: string): Promise<string | null> {
    const { data } = await this.db.from("messages").select("conversation_id").eq("id", messageId).maybeSingle();
    return data?.conversation_id ?? null;
  }

  // ── Analysis pipeline ────────────────────────────────────────
  async enqueueAnalysisJob(messageId: string): Promise<{ jobId: string; created: boolean }> {
    const id = newId();
    const { error } = await this.db.from("analysis_jobs")
      .insert({ id, message_id: messageId, status: "pending", attempts: 0, max_attempts: 4, run_at: now(), created_at: now(), updated_at: now() });
    if (!error) return { jobId: id, created: true };
    // Unique partial index violation → an active job already exists (deduped).
    const { data } = await this.db.from("analysis_jobs").select("id").eq("message_id", messageId).in("status", ["pending", "processing"]).limit(1).maybeSingle();
    return { jobId: data?.id ?? id, created: false };
  }

  async claimDueJobs(limit: number): Promise<AnalysisJobRow[]> {
    // Best-effort atomic claim via status transition; the DB partial unique
    // index guarantees no duplicates in flight for the same message.
    const due = await this.unwrap<Row[]>(
      this.db.from("analysis_jobs").select("*").eq("status", "pending").lte("run_at", now()).order("created_at").limit(Math.min(limit, 25))
    );
    const claimed: AnalysisJobRow[] = [];
    for (const row of due) {
      const { data } = await this.db.from("analysis_jobs")
        .update({ status: "processing", attempts: row.attempts + 1, updated_at: now() })
        .eq("id", row.id).eq("status", "pending")
        .select().maybeSingle();
      if (data) {
        await this.db.from("messages").update({ analysis_status: "processing" }).eq("id", row.message_id);
        claimed.push(mapJob(data));
      }
    }
    return claimed;
  }

  async completeJob(jobId: string, messageId: string): Promise<void> {
    await this.db.from("analysis_jobs").update({ status: "completed", updated_at: now() }).eq("id", jobId);
    await this.db.from("messages").update({ analysis_status: "completed" }).eq("id", messageId);
  }

  async failOrRetryJob(
    job: AnalysisJobRow,
    error: string,
    retryDelaySeconds: (attempt: number) => number
  ): Promise<"retry" | "failed"> {
    const trimmed = error.slice(0, 500);
    if (job.attempts >= job.maxAttempts) {
      await this.db.from("analysis_jobs").update({ status: "failed", last_error: trimmed, updated_at: now() }).eq("id", job.id);
      await this.db.from("messages").update({ analysis_status: "failed" }).eq("id", job.messageId);
      return "failed";
    }
    await this.db.from("analysis_jobs").update({
      status: "pending",
      last_error: trimmed,
      run_at: new Date(Date.now() + retryDelaySeconds(job.attempts) * 1000).toISOString(),
      updated_at: now(),
    }).eq("id", job.id);
    await this.db.from("messages").update({ analysis_status: "pending" }).eq("id", job.messageId);
    return "retry";
  }

  async getAnalysisJobForMessage(messageId: string): Promise<AnalysisJobRow | null> {
    const { data } = await this.db.from("analysis_jobs").select("*").eq("message_id", messageId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ? mapJob(data) : null;
  }

  async requeueFailedJob(messageId: string): Promise<boolean> {
    const { data } = await this.db.from("analysis_jobs").update({ status: "pending", attempts: 0, run_at: now(), updated_at: now() }).eq("message_id", messageId).eq("status", "failed").select("id");
    const changed = (data?.length ?? 0) > 0;
    if (changed) {
      await this.db.from("messages").update({ analysis_status: "pending" }).eq("id", messageId).eq("analysis_status", "failed");
    }
    return changed;
  }

  async upsertReaction(
    messageId: string,
    reaction: Omit<ReactionRow, "messageId" | "createdAt" | "updatedAt">
  ): Promise<void> {
    await this.db.from("analysis_reactions").upsert({
      message_id: messageId,
      category: reaction.category,
      confidence: reaction.confidence,
      provider: reaction.provider,
      model: reaction.model,
      reason: reaction.reason,
      language: reaction.language,
      updated_at: now(),
    });
  }

  async getMessageForAnalysis(messageId: string): Promise<{ message: MessageRow; context: MessageRow[] } | null> {
    const { data } = await this.db.from("messages").select("*").eq("id", messageId).is("deleted_at", null).maybeSingle();
    if (!data) return null;
    const message = mapMessage(data);
    const ctx = await this.unwrap<Row[]>(
      this.db.from("messages").select("*").eq("conversation_id", message.conversationId).neq("id", messageId).is("deleted_at", null)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(6)
    );
    return { message, context: ctx.map(mapMessage).reverse() };
  }

  async setMessageAnalysisStatus(messageId: string, status: AnalysisStatus): Promise<void> {
    await this.db.from("messages").update({ analysis_status: status }).eq("id", messageId);
  }

  async invalidateReaction(messageId: string): Promise<void> {
    await this.db.from("analysis_reactions").delete().eq("message_id", messageId);
    await this.db.from("analysis_jobs").delete().eq("message_id", messageId).in("status", ["pending", "processing"]);
  }

  // ── Stats ────────────────────────────────────────────────────
  private async reactionRowsForSenders(senderIds: string[], conversationId: string | null) {
    if (senderIds.length === 0) return [] as Row[];
    let q = this.db.from("messages").select("sender_id, analysis_reactions!inner(category)").in("sender_id", senderIds).is("deleted_at", null);
    if (conversationId) q = q.eq("conversation_id", conversationId);
    const data = await this.unwrap<Row[]>(q);
    return data.map((r) => ({ sender_id: r.sender_id as string, category: (r.analysis_reactions as Row).category as string }));
  }

  async conversationStats(conversationId: string, viewerId: string): Promise<ConversationStats> {
    const memberRows = await this.unwrap<Row[]>(
      this.db.from("conversation_members").select("user_id, profile:profiles(display_name)").eq("conversation_id", conversationId)
    );
    const senderIds = memberRows.map((r) => r.user_id as string);
    const rows = await this.reactionRowsForSenders(senderIds, conversationId);

    const viewer = emptyCounts();
    const peer = emptyCounts();
    const perMemberMap = new Map<string, { displayName: string; counts: CategoryCounts }>();
    const nameById = new Map(memberRows.map((r) => [r.user_id, (r.profile as Row)?.display_name ?? "?"]));
    for (const r of rows) {
      const cat = r.category as ReactionCategory;
      if (!(cat in viewer)) continue;
      if (r.sender_id === viewerId) {
        viewer[cat] += 1;
      } else {
        peer[cat] += 1;
        const entry = perMemberMap.get(r.sender_id) ?? { displayName: nameById.get(r.sender_id) ?? "?", counts: emptyCounts() };
        entry.counts[cat] += 1;
        perMemberMap.set(r.sender_id, entry);
      }
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
      perMember: [...perMemberMap.entries()].map(([userId, v]) => ({ userId, ...v })),
    };
  }

  async userStats(userId: string): Promise<UserStats> {
    const rows = await this.reactionRowsForSenders([userId], null);
    const counts = emptyCounts();
    for (const r of rows) {
      if (r.category in counts) counts[r.category as ReactionCategory] += 1;
    }
    const { count: totalSent } = await this.db.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", userId).is("deleted_at", null);
    const totalAnalyzed = REACTION_CATEGORIES.reduce((acc, c) => acc + counts[c], 0);
    const positive = POSITIVE.reduce((acc, c) => acc + counts[c], 0);
    return {
      counts,
      totalSent: totalSent ?? 0,
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
    {
      // Aggregate duplicate message notifications per conversation (5 min window).
      if (input.type === "message" && input.conversationId) {
        const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data } = await this.db.from("notifications").select("id")
          .eq("user_id", input.userId).eq("type", "message").eq("conversation_id", input.conversationId).is("read_at", null).gt("created_at", since).limit(1).maybeSingle();
        if (data) {
          await this.db.from("notifications").update({ body: input.body ?? "", created_at: now() }).eq("id", data.id);
          return;
        }
      }
      await this.db.from("notifications").insert({
        id: newId(),
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? "",
        conversation_id: input.conversationId ?? null,
        actor_id: input.actorId ?? null,
        created_at: now(),
      });
    }
  }

  async listNotifications(userId: string, limit: number): Promise<NotificationRow[]> {
    const data = await this.unwrap<Row[]>(
      this.db.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 100))
    );
    return data.map(mapNotification);
  }

  async unreadNotificationCount(userId: string): Promise<number> {
    const { count } = await this.db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
    return count ?? 0;
  }

  async markNotificationsRead(userId: string): Promise<void> {
    await this.db.from("notifications").update({ read_at: now() }).eq("user_id", userId).is("read_at", null);
  }

  // ── Settings ─────────────────────────────────────────────────
  async getSettings(userId: string): Promise<Record<string, unknown>> {
    const { data } = await this.db
      .from("user_settings")
      .select("settings_json")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data?.settings_json) return {};
    try {
      return JSON.parse(data.settings_json as string) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async updateSettings(userId: string, settings: Record<string, unknown>): Promise<void> {
    await this.db.from("user_settings").upsert({ user_id: userId, settings_json: JSON.stringify(settings), updated_at: now() });
  }
}
