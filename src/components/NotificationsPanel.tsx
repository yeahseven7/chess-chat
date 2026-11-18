"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, UserPlus, MessageSquare, Users, Reply } from "lucide-react";
import { api } from "@/lib/client/api";
import type { NotificationRow } from "@/lib/server/types";

const TYPE_ICONS: Record<string, typeof Bell> = {
  friend_request: UserPlus,
  friend_accepted: UserPlus,
  message: MessageSquare,
  group_invite: Users,
  reply: Reply,
};

export function NotificationsPanel({
  onOpenConversation,
  onRead,
}: {
  onOpenConversation: (conversationId: string) => void;
  onRead: () => void;
}) {
  const [data, setData] = useState<{ notifications: NotificationRow[]; unread: number } | null>(null);

  const load = useCallback(() => {
    api<{ notifications: NotificationRow[]; unread: number }>("/api/notifications")
      .then(setData)
      .catch(() => setData({ notifications: [], unread: 0 }));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function markAllRead() {
    await api("/api/notifications/read", { method: "POST" });
    load();
    onRead();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-500 px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-cream-500">Notifications</span>
        <button
          onClick={markAllRead}
          className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
        >
          <CheckCheck size={13} aria-hidden="true" /> Mark all read
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {data?.notifications.map((n) => {
          const Icon = TYPE_ICONS[n.type] ?? Bell;
          return (
            <li key={n.id}>
              <button
                onClick={() => n.conversationId && onOpenConversation(n.conversationId)}
                className={`flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition-colors ${
                  n.readAt ? "opacity-60 hover:opacity-100" : "bg-ink-700 hover:bg-ink-600"
                }`}
              >
                <span className="mt-0.5 rounded-md bg-ink-600 p-1.5 text-accent">
                  <Icon size={14} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-cream-100">{n.title}</span>
                  {n.body && <span className="mt-0.5 block truncate text-[11px] text-cream-500">{n.body}</span>}
                  <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-cream-600">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </span>
                {!n.readAt && <span className="mt-1.5 h-2 w-2 rounded-full bg-accent" aria-label="Unread" />}
              </button>
            </li>
          );
        })}
        {data?.notifications.length === 0 && (
          <li className="px-3 py-8 text-center text-xs text-cream-600">You&apos;re all caught up.</li>
        )}
      </ul>
    </div>
  );
}
