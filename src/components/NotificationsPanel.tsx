"use client";

import { useCallback, useEffect, useState } from "react";
import NotificationStack, { type StackNotification } from "@/components/motion/NotificationStack";
import type { NotificationRow } from "@/lib/server/types";

/**
 * Notifications panel: Kokonut's Notification Stack (fan out + swipe dismiss,
 * spring snapback) fed by real API data. Cards open their conversation.
 */
export function NotificationsPanel({
  onOpenConversation,
  onRead,
}: {
  onOpenConversation: (conversationId: string) => void;
  onRead: () => void;
}) {
  const [rows, setRows] = useState<NotificationRow[]>([]);

  const load = useCallback(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { notifications: NotificationRow[] }) => setRows(data.notifications ?? []))
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function markAllRead() {
    await fetch("/api/notifications/read", { method: "POST" });
    load();
    onRead();
  }

  const items: StackNotification[] = rows.map((n) => ({
    id: n.id,
    app: n.type,
    title: n.title,
    body: n.body || "Open conversation",
    time: new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="mb-3 flex h-7 items-center justify-between px-1">
        <p className="text-xs font-semibold text-cream-500">
          Alerts <span className="ml-1 text-cream-600">{rows.filter((r) => !r.readAt).length} new</span>
        </p>
        <button
          onClick={markAllRead}
          className="text-[11px] font-semibold text-accent hover:underline"
        >
          Mark all read
        </button>
      </div>
      <NotificationStack
        notifications={items}
        onOpen={(id) => {
          const row = rows.find((r) => r.id === id);
          if (row?.conversationId) onOpenConversation(row.conversationId);
        }}
      />
    </div>
  );
}
