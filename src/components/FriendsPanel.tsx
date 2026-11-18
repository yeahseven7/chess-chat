"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, UserMinus, MessageSquare } from "lucide-react";
import { api } from "@/lib/client/api";
import { Avatar } from "./Avatar";
import type { FriendshipRow, ProfileRow } from "@/lib/server/types";

interface FriendsData {
  friends: ProfileRow[];
  requests: {
    incoming: Array<FriendshipRow & { profile: ProfileRow }>;
    outgoing: Array<FriendshipRow & { profile: ProfileRow }>;
  };
}

export function FriendsPanel({
  onStartChat,
  refreshKey,
}: {
  onStartChat: (userId: string) => void;
  refreshKey: number;
}) {
  const [data, setData] = useState<FriendsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<FriendsData>("/api/friends")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load friends"));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function respond(id: string, action: "accept" | "reject") {
    await api(`/api/friends/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    load();
  }

  async function remove(otherId: string) {
    if (!confirm("Remove this friend?")) return;
    await api(`/api/friends/${otherId}`, { method: "DELETE" });
    load();
  }

  if (error) return <p role="alert" className="p-4 text-sm text-[#ff9d8f]">{error}</p>;
  if (!data) return <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-ink-700" />)}</div>;

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {data.requests.incoming.length > 0 && (
        <>
          <h3 className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-cream-500">
            Requests ({data.requests.incoming.length})
          </h3>
          <ul className="mb-3 space-y-1">
            {data.requests.incoming.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-ink-500 bg-ink-700 p-2">
                <Avatar name={r.profile.displayName} color={r.profile.avatarColor} url={r.profile.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-cream-100">{r.profile.displayName}</p>
                  <p className="truncate text-[11px] text-cream-500">@{r.profile.username}</p>
                </div>
                <button
                  onClick={() => respond(r.id, "accept")}
                  aria-label="Accept request"
                  className="rounded-md bg-accent p-1.5 text-[#1b1917] hover:bg-accent-hover"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => respond(r.id, "reject")}
                  aria-label="Reject request"
                  className="rounded-md border border-ink-500 p-1.5 text-cream-500 hover:text-cream-100"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-cream-500">
        Friends ({data.friends.length})
      </h3>
      <ul className="space-y-1">
        {data.friends.map((f) => (
          <li key={f.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-ink-700">
            <Avatar name={f.displayName} color={f.avatarColor} url={f.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-cream-100">{f.displayName}</p>
              <p className="truncate text-[11px] text-cream-500">@{f.username}</p>
            </div>
            <button
              onClick={() => onStartChat(f.id)}
              aria-label={`Message ${f.displayName}`}
              title="Send message"
              className="rounded-md border border-ink-500 p-1.5 text-cream-300 hover:border-accent hover:text-accent"
            >
              <MessageSquare size={15} />
            </button>
            <button
              onClick={() => remove(f.id)}
              aria-label={`Remove ${f.displayName}`}
              title="Remove friend"
              className="rounded-md border border-ink-500 p-1.5 text-cream-500 hover:text-[#ff9d8f]"
            >
              <UserMinus size={15} />
            </button>
          </li>
        ))}
        {data.friends.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-cream-600">
            No friends yet. Use the search to find people.
          </li>
        )}
      </ul>
    </div>
  );
}
