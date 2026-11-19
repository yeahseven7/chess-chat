"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Hash,
  Image as ImageIcon,
  LogOut,
  MessageSquarePlus,
  MessagesSquare,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings,
  Users,
  X,
  SendHorizonal,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { LogoMark } from "./ReactionGlyph";
import { Avatar } from "./Avatar";
import { MessageItem } from "./MessageItem";
import { FriendsPanel } from "./FriendsPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { ConversationInfoPanel } from "./ConversationInfoPanel";
import {
  NewDirectModal,
  NewGroupModal,
  SettingsModal,
} from "./Modals";
import type {
  AttachmentRow,
  ConversationRow,
  ConversationStats,
  ConversationSummary,
  MemberRow,
  MemberRole,
  MessageView,
  ProfileRow,
} from "@/lib/server/types";
import { useReactionRealtime } from "@/lib/client/realtime";
import { SpringTabs } from "./motion/SpringTabs";
import { useSidebarCollapseMotion } from "./motion/SidebarCollapse";
import { MagneticButton } from "./motion/MagneticButton";
import { SpringDropdown } from "./motion/SpringDropdown";
import { WordRoll } from "./motion/WordRoll";
import { StreamingTypingBubble } from "./motion/StreamingTypingBubble";
import { SendStatusButton, type SendPhase } from "./motion/SendStatusButton";
import { MentionList, mentionQuery, applyMention } from "./motion/MentionList";
import { UserPlus, PanelLeftClose, BarChart3, ExternalLink } from "lucide-react";

type SidebarTab = "chats" | "friends" | "notifications";

interface Detail {
  conversation: ConversationRow;
  members: Array<MemberRow & { profile: ProfileRow }>;
  myRole: MemberRole | null;
}

function conversationName(conv: ConversationSummary, meId: string): string {
  if (conv.type === "group") return conv.name ?? "Group";
  const other = conv.members.find((m) => m.userId !== meId);
  return other?.profile.displayName ?? "Direct message";
}

function otherMember(conv: ConversationSummary, meId: string) {
  return conv.members.find((m) => m.userId !== meId)?.profile ?? null;
}

export function AppShell({ me }: { me: ProfileRow }) {
  const router = useRouter();
  const [tab, setTab] = useState<SidebarTab>("chats");
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [messages, setMessages] = useState<MessageView[] | null>(null);
  const [pendingSends, setPendingSends] = useState<Array<MessageView & { sendStartedAt: number }>>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [friendRefreshKey, setFriendRefreshKey] = useState(0);

  const [composer, setComposer] = useState("");
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [editing, setEditing] = useState<MessageView | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [convFilter, setConvFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [rightOpen, setRightOpen] = useState(false);
  const [menu, setMenu] = useState<"newChat" | "newGroup" | "settings" | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingSentAt = useRef(0);
  const lastMessageCount = useRef(0);
  const sendStartedAtRef = useRef(new Map<string, number>());
  const asideRef = useRef<HTMLElement>(null);
  const collapseArrowRef = useRef<HTMLSpanElement>(null);
  const sidebarLabelsRef = useRef<HTMLDivElement>(null);

  useSidebarCollapseMotion({
    asideRef,
    arrowRef: collapseArrowRef,
    labelsRef: sidebarLabelsRef,
    collapsed: sidebarCollapsed,
    expandedWidth: 300,
  });

  // Realtime AI reaction delivery (no-op without Supabase realtime env vars; poll covers the rest).
  // Must be called before the conditional early return of the component.
  useReactionRealtime(activeId, (event) => {
    const startedAt = sendStartedAtRef.current.get(event.messageId);
    if (startedAt !== undefined) {
      console.info(`[perf] delivery messageId=${event.messageId} ${Math.round(performance.now() - startedAt)}ms`);
      sendStartedAtRef.current.delete(event.messageId);
    }
    setMessages((prev) =>
      prev
        ? prev.map((m) =>
            m.id === event.messageId
              ? {
                  ...m,
                  analysisStatus: "completed",
                  reaction: {
                    messageId: event.messageId,
                    conversationId: event.conversationId,
                    category: event.category,
                    confidence: event.confidence,
                    provider: event.provider ?? "supabase-realtime",
                    model: event.model ?? "unknown",
                    reason: event.reason ?? "",
                    language: event.language ?? "en",
                    createdAt: event.createdAt,
                    updatedAt: event.createdAt,
                  },
                }
              : m
          )
        : prev
    );
  });

  // ── data loading ─────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const { conversations } = await api<{ conversations: ConversationSummary[] }>("/api/conversations");
      setConversations(conversations);
    } catch {
      /* keep stale data */
    }
  }, []);

  const loadMessages = useCallback(async (id: string, query?: string) => {
    try {
      const q = query?.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";
      const { messages } = await api<{ messages: MessageView[] }>(
        `/api/conversations/${id}/messages?limit=200${q}`
      );
      setMessages(messages);
    } catch {
      /* keep stale */
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api<Detail>(`/api/conversations/${id}`));
    } catch {
      setDetail(null);
    }
  }, []);

  const loadStats = useCallback(async (id: string) => {
    setStatsLoading(true);
    try {
      const { stats } = await api<{ stats: ConversationStats }>(`/api/conversations/${id}/stats`);
      setStats(stats);
    } catch {
      /* keep stale */
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadTyping = useCallback(async (id: string) => {
    try {
      const { typing } = await api<{ typing: Array<{ id: string; displayName: string }> }>(
        `/api/conversations/${id}/typing`
      );
      setTypingNames(typing.map((t) => t.displayName));
    } catch {
      setTypingNames([]);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    try {
      await api(`/api/conversations/${id}/read`, { method: "POST" });
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadNotificationCount = useCallback(async () => {
    try {
      const { unread } = await api<{ unread: number }>("/api/notifications");
      setUnreadNotifs(unread);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadNotificationCount();
    const t = setInterval(() => {
      loadConversations();
      loadNotificationCount();
    }, 4000);
    return () => clearInterval(t);
  }, [loadConversations, loadNotificationCount]);

  useEffect(() => {
    if (!activeId) return;
    setMessages(null);
    setStats(null);
    setDetail(null);
    setReplyTo(null);
    setEditing(null);
    setChatSearch("");
    loadMessages(activeId);
    loadDetail(activeId);
    loadStats(activeId);
    markRead(activeId);
    const t = setInterval(() => {
      loadMessages(activeId, chatSearch);
      loadDetail(activeId);
      loadStats(activeId);
      loadTyping(activeId);
      markRead(activeId);
    }, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // instant refresh when in-conversation search text changes
  useEffect(() => {
    if (!activeId) return;
    const t = setTimeout(() => loadMessages(activeId, chatSearch), 300);
    return () => clearTimeout(t);
  }, [chatSearch, activeId, loadMessages]);

  // scroll to bottom on new messages
  useEffect(() => {
    const count = messages?.length ?? 0;
    if (count !== lastMessageCount.current) {
      lastMessageCount.current = count;
      bottomRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "end",
      });
    }
  }, [messages?.length]);

  // ── handlers ─────────────────────────────────────────────────
  const active = useMemo(
    () => conversations?.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const selectConversation = useCallback(
    (id: string) => {
      setActiveId(id);
      setMobileChatOpen(true);
    },
    []
  );

  const refreshActive = useCallback(() => {
    if (!activeId) return;
    loadMessages(activeId, chatSearch);
    loadStats(activeId);
    loadDetail(activeId);
    loadConversations();
  }, [activeId, chatSearch, loadMessages, loadStats, loadDetail, loadConversations]);

  async function send() {
    if (!activeId) return;
    const text = composer.trim();
    if (!text) return;
    const sendStartedAt = performance.now();

    // Optimistic: show the message instantly, clear the composer, hide send UI.
    const optimisticId = `pending-${sendStartedAt}`;
    const optimistic: MessageView & { sendStartedAt: number } = {
      id: optimisticId,
      conversationId: activeId,
      senderId: me.id,
      sender: me,
      content: text,
      replyToId: replyTo?.id ?? null,
      replyTo: replyTo ?? null,
      editedAt: null,
      deletedAt: null,
      analysisStatus: "pending",
      createdAt: new Date().toISOString(),
      reaction: null,
      emojiReactions: [],
      attachments: pendingAttachments.length
        ? pendingAttachments.map((a) => ({
            ...a,
            messageId: optimisticId,
          }))
        : [],
      sendStartedAt,
    };
    setPendingSends((prev) => [...prev, optimistic]);
    setComposer("");
    setSendBusy(true);
    setSendPhase("sending");
    const attachmentsToAttach = pendingAttachments.map((a) => a.id);
    const editingTarget = editing;
    setEditing(null);
    setPendingAttachments([]);
    setReplyTo(null);

    try {
      let savedMessage: MessageView;
      if (editingTarget) {
        await api(`/api/messages/${editingTarget.id}`, {
          method: "PATCH",
          body: JSON.stringify({ content: text }),
        });
        savedMessage = { ...editingTarget, content: text, editedAt: new Date().toISOString(), analysisStatus: "pending", reaction: null };
      } else {
        const res = await api<{ message: MessageView }>(`/api/conversations/${activeId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: text,
            replyToId: optimistic.replyToId,
            attachmentIds: attachmentsToAttach,
          }),
        });
        savedMessage = res.message;
      }

      // Replace the optimistic row with the persisted one (identical except id + timestamps).
      setPendingSends((prev) => prev.filter((p) => p.id !== optimisticId));
      sendStartedAtRef.current.set(savedMessage.id, sendStartedAt);
      setMessages((prev) => {
        if (!prev) return prev;
        if (prev.some((m) => m.id === savedMessage.id)) return prev;
        return [...prev, savedMessage];
      });
      const saveMs = Math.round(performance.now() - sendStartedAt);
      console.info(`[perf] client send save=${saveMs}ms optimistic=0ms`);
      setSendPhase("sent");
      window.setTimeout(() => setSendPhase((p) => (p === "sent" ? "idle" : p)), 1400);

      // Background refresh (not awaited — reactions arrive via poll/realtime).
      void loadStats(activeId);
      void loadConversations();
    } catch (err) {
      // Persistence failed: drop the optimistic row and restore the composer.
      setPendingSends((prev) => prev.filter((p) => p.id !== optimisticId));
      setComposer(text);
      if (pendingAttachments.length) setPendingAttachments(attachmentsToAttach.map((id) => ({ ...optimistic.attachments.find((a) => a.id === id)! })));
      console.error("[send] failed", err);
      setSendPhase("idle");
    } finally {
      setSendBusy(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setPendingAttachments((prev) => [...prev, data.attachment as AttachmentRow]);
    } catch {
      /* surfaces via missing attachment; keep simple */
    } finally {
      setUploading(false);
    }
  }

  function pingTyping() {
    if (!activeId) return;
    const nowTs = Date.now();
    if (nowTs - typingSentAt.current < 2500) return;
    typingSentAt.current = nowTs;
    api(`/api/conversations/${activeId}/typing`, { method: "POST" }).catch(() => undefined);
  }

  // @mention support: the last @word in the composer opens a spring-animated picker
  // populated with the current conversation's members.
  const mention = mentionQuery(composer);
  const mentionCandidates = (() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return (detail?.members ?? [])
      .map((m) => m.profile)
      .filter((p) => !q || p.displayName.toLowerCase().includes(q) || p.username.toLowerCase().includes(q))
      .slice(0, 6);
  })();

  useEffect(() => setMentionIndex(0), [mention?.query]);

  function handleMentionKey(event: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!mention || !mentionCandidates.length) return false;
    const count = mentionCandidates.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setMentionIndex((i) => (i + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const person = mentionCandidates[Math.min(mentionIndex, count - 1)];
      if (person) setComposer(applyMention(composer, person));
      setMentionIndex(0);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setComposer(`${composer} `);
      return true;
    }
    return false;
  }

  async function startDirectChat(userId: string) {
    try {
      const { conversation } = await api<{ conversation: ConversationRow }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ type: "direct", userId }),
      });
      await loadConversations();
      setTab("chats");
      selectConversation(conversation.id);
    } catch {
      /* non-fatal */
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const direct = conversations?.filter((c) => c.type === "direct") ?? [];
  const groups = conversations?.filter((c) => c.type === "group") ?? [];
  const filterLower = convFilter.trim().toLowerCase();
  const visibleDirect = filterLower
    ? direct.filter((c) => conversationName(c, me.id).toLowerCase().includes(filterLower))
    : direct;
  const visibleGroups = filterLower
    ? groups.filter((c) => conversationName(c, me.id).toLowerCase().includes(filterLower))
    : groups;

  const activeName = active ? conversationName(active, me.id) : "";
  const activeOther = active ? otherMember(active, me.id) : null;
  const rightName = active?.type === "group" ? "Everyone else" : activeOther?.displayName ?? "Them";
  const leftName = "You";

  const renderConversationRow = (conv: ConversationSummary) => {
    const name = conversationName(conv, me.id);
    const unread = conv.unreadCount;
    const isGroup = conv.type === "group";
    const other = otherMember(conv, me.id);
    return (
      <li key={conv.id}>
        <button
          onClick={() => selectConversation(conv.id)}
          aria-current={conv.id === activeId ? "page" : undefined}
          className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors ${
            conv.id === activeId ? "bg-ink-600" : "hover:bg-ink-700"
          }`}
        >
          {isGroup ? (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-cream-100"
              style={{ background: conv.avatarColor }}
            >
              <Hash size={18} aria-hidden="true" />
            </span>
          ) : (
            <Avatar
              name={name}
              color={other?.avatarColor}
              url={other?.avatarUrl}
              size={40}
              online={other ? Date.now() - new Date(other.lastSeenAt).getTime() < 2 * 60 * 1000 : undefined}
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span data-collapsible-label style={{ "--label-index": 3 } as React.CSSProperties} className="truncate text-sm font-medium text-cream-100">{name}</span>
              {unread > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-[#1b1917]">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            <span data-collapsible-label style={{ "--label-index": 4 } as React.CSSProperties} className="mt-0.5 block truncate text-[11px] text-cream-500">
              {conv.lastMessage?.content ?? "Say hello 👋"}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ink-800">
      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <aside
        ref={asideRef}
        data-collapsed={sidebarCollapsed}
        className={`sidebar-shell ${mobileChatOpen ? "hidden" : "flex"} h-full w-full shrink-0 flex-col overflow-hidden border-r border-ink-500 bg-ink-800 md:flex md:w-[300px]`}
      >
        {/* brand + actions */}
        <div className="flex items-center justify-between gap-2 border-b border-ink-500 px-3 py-3">
          {!sidebarCollapsed && (
            <Link href="/app" className="flex items-center gap-2" aria-label="ChessChat home">
              <LogoMark size={28} />
              <span data-collapsible-label style={{ "--label-index": 0 } as React.CSSProperties} className="text-lg font-extrabold tracking-tight text-cream-100">ChessChat</span>
            </Link>
          )}
          <div className={`flex shrink-0 items-center gap-1 ${sidebarCollapsed ? "mx-auto" : ""}`}>
            {!sidebarCollapsed && (
              <MagneticButton
                ariaLabel="New direct message"
                label="New"
                icon={<MessageSquarePlus size={15} aria-hidden="true" />}
                onClick={() => setMenu("newChat")}
                className="!p-1.5"
              />
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-ink-500 text-cream-500 hover:text-cream-100 md:inline-flex"
            >
              <span ref={collapseArrowRef} className="inline-flex">
                <PanelLeftClose size={16} aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>

        <div ref={sidebarLabelsRef} className="flex min-h-0 flex-1 flex-col">
        {/* search conversations */}
        <div className="border-b border-ink-500 px-3 py-2">
          <div className="flex items-center gap-2 rounded-lg bg-ink-700 px-3 py-2">
            <Search size={14} className="shrink-0 text-cream-500" aria-hidden="true" />
            <input
              value={convFilter}
              onChange={(e) => setConvFilter(e.target.value)}
              placeholder="Filter conversations…"
              aria-label="Filter conversations"
              className="w-full bg-transparent text-sm outline-none placeholder-cream-600"
            />
          </div>
        </div>

        {/* tabs — spring pill with stretchy leading/trailing edges */}
        <SpringTabs
          label="Sidebar sections"
          value={tab}
          onChange={setTab}
          items={[
            { id: "chats", label: "Chats", icon: MessagesSquare },
            { id: "friends", label: "Friends", icon: Users },
            { id: "notifications", label: "Alerts", icon: Bell, badge: unreadNotifs },
          ]}
        />

        {/* tab content */}
        {tab === "chats" && (
          <div className="flex-1 overflow-y-auto p-2">
            <div className="mb-1 flex items-center justify-between px-2 pt-1">
              <h2 data-collapsible-label style={{ "--label-index": 1 } as React.CSSProperties} className="text-[10px] font-bold uppercase tracking-[0.15em] text-cream-600">
                Direct messages
              </h2>
            </div>
            <ul className="space-y-0.5">{visibleDirect.map(renderConversationRow)}</ul>
            <div className="mb-1 mt-3 flex items-center justify-between px-2">
              <h2 data-collapsible-label style={{ "--label-index": 2 } as React.CSSProperties} className="text-[10px] font-bold uppercase tracking-[0.15em] text-cream-600">
                Groups
              </h2>
              <button
                onClick={() => setMenu("newGroup")}
                aria-label="Create group"
                title="Create group"
                className="rounded p-1 text-cream-500 hover:text-accent"
              >
                <Users size={14} />
              </button>
            </div>
            <ul className="space-y-0.5">{visibleGroups.map(renderConversationRow)}</ul>
            {conversations && conversations.length === 0 && (
              <div className="px-4 py-10 text-center">
                <MessagesSquare size={28} className="mx-auto text-cream-600" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-cream-300">No conversations yet</p>
                <p className="mt-1 text-xs text-cream-600">Find a friend and start chatting.</p>
              </div>
            )}
          </div>
        )}
        {tab === "friends" && <FriendsPanel onStartChat={startDirectChat} refreshKey={friendRefreshKey} />}
        {tab === "notifications" && (
          <NotificationsPanel
            onOpenConversation={(id) => {
              setTab("chats");
              selectConversation(id);
            }}
            onRead={() => setUnreadNotifs(0)}
          />
        )}

        {/* profile footer */}
        <div className="border-t border-ink-500 p-2">
          <div className="flex items-center gap-2 rounded-xl p-1.5">
            <Link href={`/profile/${me.username}`} className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar name={me.displayName} color={me.avatarColor} url={me.avatarUrl} size={36} online />
              <span className="min-w-0">
                <span data-collapsible-label style={{ "--label-index": 8 } as React.CSSProperties} className="block truncate text-sm font-semibold text-cream-100">{me.displayName}</span>
                <span className="block truncate text-[11px] text-cream-500">@{me.username}</span>
              </span>
            </Link>
            <button onClick={() => setMenu("settings")} aria-label="Settings" title="Settings" className="rounded-lg p-2 text-cream-500 hover:bg-ink-700 hover:text-cream-100">
              <Settings size={16} />
            </button>
            <button onClick={logout} aria-label="Log out" title="Log out" className="rounded-lg p-2 text-cream-500 hover:bg-ink-700 hover:text-[#ff9d8f]">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        </div>
      </aside>

      {/* ── Center: active conversation ──────────────────────────── */}
      <main className={`${mobileChatOpen ? "flex" : "hidden"} h-full min-w-0 flex-1 flex-col bg-ink-800 md:flex`}>
        {!active ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <LogoMark size={72} />
            <div>
              <h1 className="text-2xl font-extrabold text-cream-100">ChessChat</h1>
              <p className="mt-1 max-w-xs text-sm text-cream-500">
                Pick a conversation on the left, or start a new one. Every message gets reviewed.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* header */}
            <header className="flex items-center gap-2 border-b border-ink-500 px-3 py-2.5">
              <button
                onClick={() => setMobileChatOpen(false)}
                className="rounded-lg p-1.5 text-cream-500 hover:bg-ink-700 md:hidden"
                aria-label="Back to chats"
              >
                <ArrowLeft size={18} />
              </button>
              {active.type === "group" ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: active.avatarColor }}>
                  <Hash size={16} className="text-cream-100" aria-hidden="true" />
                </span>
              ) : (
                <Avatar
                  name={activeName}
                  color={activeOther?.avatarColor}
                  url={activeOther?.avatarUrl}
                  size={36}
                  online={activeOther ? Date.now() - new Date(activeOther.lastSeenAt).getTime() < 2 * 60 * 1000 : undefined}
                />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-bold text-cream-100">
                  <WordRoll text={activeName} />
                </h1>
                <p className="text-[10px] uppercase tracking-wide text-cream-500">
                  {active.type === "group"
                    ? `${detail?.members.length ?? "…"} members`
                    : activeOther && Date.now() - new Date(activeOther.lastSeenAt).getTime() < 2 * 60 * 1000
                      ? "Online"
                      : "Offline"}
                </p>
              </div>
              <button
                onClick={() => setSearchOpen((v) => !v)}
                aria-pressed={searchOpen}
                aria-label="Search in conversation"
                title="Search in conversation"
                className="rounded-lg p-2 text-cream-500 hover:bg-ink-700 hover:text-cream-100"
              >
                <Search size={17} />
              </button>
              <button
                onClick={() => setRightOpen((v) => !v)}
                aria-label="Toggle info panel"
                title="Toggle info panel"
                aria-pressed={rightOpen}
                className="rounded-lg p-2 text-cream-500 hover:bg-ink-700 hover:text-cream-100"
              >
                {rightOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
              </button>
              <SpringDropdown
                label="Conversation options"
                options={[
                  {
                    id: "search",
                    label: "Search messages",
                    icon: <Search size={15} aria-hidden="true" />,
                    onSelect: () => setSearchOpen((v) => !v),
                  },
                  {
                    id: "stats",
                    label: "Reaction stats",
                    icon: <BarChart3 size={15} aria-hidden="true" />,
                    onSelect: () => setRightOpen(true),
                  },
                  {
                    id: "media",
                    label: "Shared media",
                    icon: <ImageIcon size={15} aria-hidden="true" />,
                    onSelect: () => setRightOpen(true),
                  },
                  {
                    id: "profile",
                    label: "View profile",
                    icon: <ExternalLink size={15} aria-hidden="true" />,
                    onSelect: () => {
                      if (activeOther) router.push(`/profile/${activeOther.username}`);
                    },
                  },
                ]}
              />
            </header>

            {/* in-conversation search */}
            {searchOpen && (
              <div className="flex items-center gap-2 border-b border-ink-500 bg-ink-700 px-3 py-2">
                <Search size={14} className="text-cream-500" aria-hidden="true" />
                <input
                  autoFocus
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Search messages…"
                  aria-label="Search messages"
                  className="w-full bg-transparent text-sm outline-none placeholder-cream-600"
                />
                {chatSearch && (
                  <button onClick={() => setChatSearch("")} aria-label="Clear search" className="text-cream-500 hover:text-cream-100">
                    <X size={15} />
                  </button>
                )}
              </div>
            )}

            {/* messages */}
            <div className="flex-1 overflow-y-auto py-2" aria-live="polite" data-testid="message-list">
              {messages === null ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-2xl bg-ink-700" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center text-sm text-cream-500">
                  {chatSearch ? "No messages match your search." : "No messages yet. Say hi!"}
                </div>
              ) : (
                messages.map((m) => (
                  <MessageItem
                    key={m.id}
                    message={m}
                    isMine={m.senderId === me.id}
                    isGroup={active.type === "group"}
                    onReply={(msg) => {
                      setReplyTo(msg);
                      setEditing(null);
                    }}
                    onEdit={(msg) => {
                      setEditing(msg);
                      setComposer(msg.content);
                      setReplyTo(null);
                    }}
                    onChanged={refreshActive}
                  />
                ))
              )}
              {pendingSends.filter((p) => p.conversationId === activeId).map((p) => (
                <MessageItem
                  key={p.id}
                  message={p}
                  isMine={p.senderId === me.id}
                  isGroup={active.type === "group"}
                  onReply={() => undefined}
                  onEdit={() => undefined}
                  onChanged={() => undefined}
                  sending
                />
              ))}
              {typingNames.length > 0 && <StreamingTypingBubble names={typingNames} />}
              <div ref={bottomRef} />
            </div>

            {/* reply/edit banner */}
            {(replyTo || editing) && (
              <div className="flex items-center justify-between gap-2 border-t border-ink-500 bg-ink-700 px-4 py-1.5 text-xs text-cream-300">
                <span className="min-w-0 truncate">
                  {editing ? "Editing message" : `Replying to: ${replyTo?.content.slice(0, 100)}`}
                </span>
                <button
                  onClick={() => {
                    setReplyTo(null);
                    setEditing(null);
                    setComposer("");
                  }}
                  aria-label="Cancel"
                  className="text-cream-500 hover:text-cream-100"
                >
                  <X size={15} />
                </button>
              </div>
            )}

            {/* pending attachments */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-ink-500 bg-ink-700 px-4 py-2">
                {pendingAttachments.map((a) => (
                  <span key={a.id} className="flex items-center gap-1.5 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-[11px] text-cream-300">
                    {a.kind === "image" ? <ImageIcon size={12} /> : <Paperclip size={12} />}
                    <span className="max-w-[140px] truncate">{a.name}</span>
                    <button aria-label="Remove attachment" onClick={() => setPendingAttachments((p) => p.filter((x) => x.id !== a.id))} className="text-cream-500 hover:text-cream-100">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="relative flex items-end gap-2 border-t border-ink-500 p-3"
            >
              {mention && mentionCandidates.length > 0 && (
                <MentionList
                  candidates={mentionCandidates}
                  activeIndex={mentionIndex}
                  onPick={(person) => {
                    setComposer(applyMention(composer, person));
                    setMentionIndex(0);
                  }}
                />
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,application/zip,application/octet-stream"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadFile(file);
                  e.target.value = "";
                }}
                aria-label="Attach a file"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !!editing}
                aria-label="Attach image or file"
                title="Attach image or file"
                className="rounded-xl border border-ink-500 p-3 text-cream-500 transition-colors hover:border-cream-600 hover:text-cream-100 disabled:opacity-40"
              >
                <Paperclip size={18} />
              </button>
              <label htmlFor="message-input" className="sr-only">
                Message
              </label>
              <textarea
                id="message-input"
                rows={1}
                value={composer}
                onChange={(e) => {
                  setComposer(e.target.value);
                  pingTyping();
                }}
                onKeyDown={(e) => {
                  if (handleMentionKey(e)) return;
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={editing ? "Edit your message…" : "Type a message…"}
                className="max-h-40 min-h-[46px] flex-1 resize-none rounded-2xl border border-ink-500 bg-ink-700 px-4 py-3 text-[15px] outline-none placeholder-cream-600 focus:border-accent"
              />
              <SendStatusButton
                phase={sendPhase}
                disabled={sendBusy || !composer.trim()}
                onClick={() => undefined}
              />
            </form>
          </>
        )}
      </main>

      {/* ── Right panel (desktop static / overlay on toggle) ─────── */}
      {active && (
        <div
          className={
            rightOpen
              ? "fixed inset-y-0 right-0 z-40 flex w-[300px] flex-col shadow-2xl sm:w-[340px] xl:static xl:z-auto xl:shadow-none"
              : "hidden flex-col xl:static xl:z-auto xl:flex xl:w-[340px] xl:shadow-none"
          }
        >
          <ConversationInfoPanel
            conversationId={active.id}
            me={me}
            detail={detail}
            stats={stats}
            statsLoading={statsLoading}
            leftName={leftName}
            rightName={rightName}
            onChanged={() => {
              loadDetail(active.id);
              loadConversations();
              setFriendRefreshKey((k) => k + 1);
            }}
          />
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────── */}
      {menu === "newChat" && (
        <NewDirectModal onClose={() => setMenu(null)} onCreated={(id) => { void loadConversations(); selectConversation(id); }} />
      )}
      {menu === "newGroup" && (
        <NewGroupModal onClose={() => setMenu(null)} onCreated={(id) => { void loadConversations(); selectConversation(id); }} />
      )}
      {menu === "settings" && (
        <SettingsModal
          me={me}
          onClose={() => setMenu(null)}
          onSaved={() => {
            router.refresh();
            void loadConversations();
          }}
        />
      )}
    </div>
  );
}
