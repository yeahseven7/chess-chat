/** Row shapes returned by the store (camelCase, ISO strings). */

export interface ProfileRow {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  bio: string;
  avatarColor: string;
  avatarUrl: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export type FriendshipStatus = "pending" | "accepted" | "blocked";

export interface FriendshipRow {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
}

export type ConversationType = "direct" | "group";
export type MemberRole = "owner" | "admin" | "member";

export interface ConversationRow {
  id: string;
  type: ConversationType;
  name: string | null;
  avatarColor: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberRow {
  conversationId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
  lastReadAt: string;
}

export type AnalysisStatus = "pending" | "processing" | "completed" | "failed";

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  replyToId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  analysisStatus: AnalysisStatus;
  createdAt: string;
}

export interface AttachmentRow {
  id: string;
  messageId: string | null;
  uploaderId: string;
  kind: "image" | "file";
  name: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: string;
}

export interface ReactionRow {
  messageId: string;
  conversationId: string;
  category: string;
  confidence: number;
  provider: string;
  model: string;
  reason: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmojiReactionRow {
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface AnalysisJobRow {
  id: string;
  messageId: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  conversationId: string | null;
  actorId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ConversationSummary extends ConversationRow {
  members: Array<MemberRow & { profile: ProfileRow }>;
  lastMessage: MessageRow | null;
  unreadCount: number;
}

export interface EmojiReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface MessageView extends MessageRow {
  sender: ProfileRow | null;
  replyTo: MessageRow | null;
  reaction: ReactionRow | null;
  emojiReactions: EmojiReactionSummary[];
  attachments: AttachmentRow[];
}

export interface CategoryCounts {
  great: number;
  best: number;
  excellent: number;
  mistake: number;
  miss: number;
  blunder: number;
}

export interface ConversationStats {
  viewer: CategoryCounts;
  peer: CategoryCounts;
  totalAnalyzed: number;
  mostCommon: string | null;
  positive: number;
  negative: number;
  perMember: Array<{ userId: string; displayName: string; counts: CategoryCounts }>;
}

export interface UserStats {
  counts: CategoryCounts;
  totalSent: number;
  totalAnalyzed: number;
  positive: number;
  negative: number;
  mostCommon: string | null;
}

export interface MessageSearchHit {
  message: MessageRow;
  conversationName: string;
  conversationType: ConversationType;
  senderName: string;
}

export interface Store {
  // profiles / auth helpers
  createProfile(input: {
    id: string;
    username: string;
    email: string | null;
    displayName: string;
    passwordHash: string;
  }): Promise<ProfileRow>;
  getProfileById(id: string): Promise<ProfileRow | null>;
  getProfileByUsername(username: string): Promise<ProfileRow | null>;
  getProfileByEmail(email: string): Promise<ProfileRow | null>;
  /** Local mode only — returns the password hash for credential verification. */
  getPasswordHash(userId: string): Promise<string | null>;
  updateProfile(
    id: string,
    patch: Partial<Pick<ProfileRow, "displayName" | "bio" | "avatarColor" | "avatarUrl">>
  ): Promise<ProfileRow | null>;
  touchLastSeen(id: string): Promise<void>;
  searchProfiles(query: string, excludeId: string, limit: number): Promise<ProfileRow[]>;
  suggestProfiles(excludeId: string, limit: number): Promise<ProfileRow[]>;

  // blocks / reports
  blockUser(blockerId: string, blockedId: string): Promise<void>;
  unblockUser(blockerId: string, blockedId: string): Promise<void>;
  isBlocked(a: string, b: string): Promise<boolean>;
  reportUser(input: {
    reporterId: string;
    reportedId: string;
    reason: string;
    detail: string;
  }): Promise<void>;

  // friends
  listFriends(userId: string): Promise<ProfileRow[]>;
  listFriendRequests(userId: string): Promise<{
    incoming: Array<FriendshipRow & { profile: ProfileRow }>;
    outgoing: Array<FriendshipRow & { profile: ProfileRow }>;
  }>;
  getFriendshipBetween(a: string, b: string): Promise<FriendshipRow | null>;
  sendFriendRequest(
    requesterId: string,
    addresseeId: string
  ): Promise<{ friendship: FriendshipRow; autoAccepted: boolean }>;
  respondFriendRequest(
    friendshipId: string,
    userId: string,
    accept: boolean
  ): Promise<FriendshipRow | null>;
  removeFriendship(userId: string, otherId: string): Promise<void>;

  // conversations
  listConversations(userId: string): Promise<ConversationSummary[]>;
  getConversationForUser(id: string, userId: string): Promise<ConversationRow | null>;
  createDirectConversation(a: string, b: string): Promise<ConversationRow>;
  createGroup(name: string, creatorId: string, memberIds: string[]): Promise<ConversationRow>;
  renameConversation(id: string, name: string): Promise<void>;
  setConversationAvatarColor(id: string, color: string): Promise<void>;
  listMembers(conversationId: string): Promise<Array<MemberRow & { profile: ProfileRow }>>;
  getMemberRole(conversationId: string, userId: string): Promise<MemberRole | null>;
  addGroupMember(conversationId: string, userId: string, role: MemberRole): Promise<void>;
  removeGroupMember(conversationId: string, userId: string): Promise<void>;
  updateMemberRole(conversationId: string, userId: string, role: MemberRole): Promise<void>;
  markConversationRead(conversationId: string, userId: string): Promise<void>;

  // messages
  listMessages(
    conversationId: string,
    userId: string,
    opts: { after?: string; limit?: number; query?: string }
  ): Promise<MessageView[]>;
  createMessage(input: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    replyToId: string | null;
    attachmentIds: string[];
  }): Promise<MessageView | null>;
  editMessage(
    messageId: string,
    userId: string,
    content: string
  ): Promise<MessageRow | null>;
  deleteMessage(messageId: string, userId: string): Promise<boolean>;
  toggleEmojiReaction(messageId: string, userId: string, emoji: string): Promise<void>;
  searchMyMessages(userId: string, query: string, limit: number): Promise<MessageSearchHit[]>;
  listSharedAttachments(conversationId: string): Promise<AttachmentRow[]>;
  createAttachment(input: {
    id: string;
    uploaderId: string;
    kind: "image" | "file";
    name: string;
    mimeType: string;
    size: number;
    path: string;
  }): Promise<AttachmentRow>;
  getAttachment(id: string): Promise<AttachmentRow | null>;
  getConversationIdForMessage(messageId: string): Promise<string | null>;

  // analysis pipeline
  enqueueAnalysisJob(messageId: string): Promise<{ jobId: string; created: boolean }>;
  claimDueJobs(limit: number): Promise<AnalysisJobRow[]>;
  completeJob(jobId: string, messageId: string): Promise<void>;
  /** Reset `processing` jobs older than `staleSeconds` back to `pending`. */
  recoverStuckJobs(staleSeconds?: number): Promise<number>;
  failOrRetryJob(
    job: AnalysisJobRow,
    error: string,
    retryDelaySeconds: (attempt: number) => number,
    forceFailed?: boolean
  ): Promise<"retry" | "failed">;
  getAnalysisJobForMessage(messageId: string): Promise<AnalysisJobRow | null>;
  requeueFailedJob(messageId: string): Promise<boolean>;
  upsertReaction(
    messageId: string,
    reaction: Omit<ReactionRow, "messageId" | "conversationId" | "createdAt" | "updatedAt">
  ): Promise<void>;
  getMessageForAnalysis(
    messageId: string
  ): Promise<{ message: MessageRow; context: MessageRow[] } | null>;
  setMessageAnalysisStatus(messageId: string, status: AnalysisStatus): Promise<void>;
  invalidateReaction(messageId: string): Promise<void>;

  // stats
  conversationStats(conversationId: string, viewerId: string): Promise<ConversationStats>;
  userStats(userId: string): Promise<UserStats>;

  // notifications
  createNotification(input: {
    userId: string;
    type: string;
    title: string;
    body?: string;
    conversationId?: string | null;
    actorId?: string | null;
  }): Promise<void>;
  listNotifications(userId: string, limit: number): Promise<NotificationRow[]>;
  unreadNotificationCount(userId: string): Promise<number>;
  markNotificationsRead(userId: string): Promise<void>;

  // settings
  getSettings(userId: string): Promise<Record<string, unknown>>;
  updateSettings(userId: string, settings: Record<string, unknown>): Promise<void>;
}
