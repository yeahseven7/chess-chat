"use client";

import { useEffect, useState } from "react";
import { Crown, Shield, UserMinus, Image as ImageIcon, File as FileIcon } from "lucide-react";
import { api } from "@/lib/client/api";
import { Avatar } from "./Avatar";
import { StatsPanel } from "./StatsPanel";
import type {
  AttachmentRow,
  ConversationRow,
  ConversationStats,
  MemberRow,
  MemberRole,
  ProfileRow,
} from "@/lib/server/types";

interface Detail {
  conversation: ConversationRow;
  members: Array<MemberRow & { profile: ProfileRow }>;
  myRole: MemberRole | null;
}

export function ConversationInfoPanel({
  conversationId,
  me,
  detail,
  stats,
  statsLoading,
  leftName,
  rightName,
  onChanged,
}: {
  conversationId: string;
  me: ProfileRow;
  detail: Detail | null;
  stats: ConversationStats | null;
  statsLoading: boolean;
  leftName: string;
  rightName: string;
  onChanged: () => void;
}) {
  const [media, setMedia] = useState<AttachmentRow[]>([]);

  useEffect(() => {
    api<{ attachments: AttachmentRow[] }>(`/api/conversations/${conversationId}/media`)
      .then((d) => setMedia(d.attachments))
      .catch(() => setMedia([]));
  }, [conversationId, detail]);

  const conversation = detail?.conversation;
  const isGroup = conversation?.type === "group";
  const canManage = detail?.myRole === "owner" || detail?.myRole === "admin";

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the group?")) return;
    await api(`/api/conversations/${conversationId}/members?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    onChanged();
  }

  async function setRole(userId: string, role: MemberRole) {
    await api(`/api/conversations/${conversationId}/members`, {
      method: "PATCH",
      body: JSON.stringify({ userId, role }),
    });
    onChanged();
  }

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-y-auto border-l border-ink-500 bg-ink-800 p-3">
      {/* Conversation header */}
      <div className="rounded-xl border border-ink-500 bg-ink-700 p-4 text-center">
        <Avatar
          name={conversation?.name ?? rightName}
          color={conversation?.avatarColor}
          size={64}
        />
        <h2 className="mt-2 truncate text-base font-bold text-cream-100">
          {conversation?.name ?? rightName}
        </h2>
        <p className="text-[11px] uppercase tracking-wide text-cream-500">
          {isGroup ? `Group · ${detail?.members.length ?? 0} members` : "Direct message"}
        </p>
      </div>

      {/* Statistics */}
      <StatsPanel stats={stats} leftName={leftName} rightName={rightName} loading={statsLoading} />

      {/* Members */}
      {isGroup && detail && (
        <div className="rounded-xl border border-ink-500 bg-ink-700 p-3">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-cream-500">
            Members
          </h3>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {detail.members.map((m) => {
              const isMe = m.userId === me.id;
              return (
                <li key={m.userId} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-ink-600">
                  <Avatar
                    name={m.profile.displayName}
                    color={m.profile.avatarColor}
                    url={m.profile.avatarUrl}
                    size={30}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-cream-100">
                      {m.profile.displayName}
                      {isMe && <span className="text-cream-500"> (you)</span>}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-cream-600">{m.role}</p>
                  </div>
                  {m.role === "owner" && <Crown size={13} className="text-[#e8a33d]" aria-label="Owner" />}
                  {m.role === "admin" && <Shield size={13} className="text-[#4a9ae8]" aria-label="Admin" />}
                  {canManage && !isMe && m.role !== "owner" && detail.myRole === "owner" && (
                    <button
                      onClick={() => setRole(m.userId, m.role === "admin" ? "member" : "admin")}
                      title={m.role === "admin" ? "Demote to member" : "Promote to admin"}
                      aria-label={m.role === "admin" ? "Demote to member" : "Promote to admin"}
                      className="rounded p-1 text-cream-600 hover:bg-ink-500 hover:text-cream-100"
                    >
                      <Shield size={13} />
                    </button>
                  )}
                  {canManage && !isMe && m.role !== "owner" && (
                    <button
                      onClick={() => removeMember(m.userId)}
                      title="Remove from group"
                      aria-label="Remove from group"
                      className="rounded p-1 text-cream-600 hover:bg-ink-500 hover:text-[#ff9d8f]"
                    >
                      <UserMinus size={13} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Shared media */}
      <div className="rounded-xl border border-ink-500 bg-ink-700 p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-cream-500">
          <ImageIcon size={12} aria-hidden="true" /> Shared media
        </h3>
        {media.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-cream-600">Nothing shared yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {media.slice(0, 9).map((a) =>
              a.kind === "image" ? (
                <a key={a.id} href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-ink-500">
                  <img src={`/api/files/${a.id}`} alt={a.name} className="h-full w-full object-cover" />
                </a>
              ) : (
                <a
                  key={a.id}
                  href={`/api/files/${a.id}`}
                  download={a.name}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-ink-500 bg-ink-800 p-2 text-center hover:border-cream-600"
                >
                  <FileIcon size={18} className="text-cream-500" aria-hidden="true" />
                  <span className="w-full truncate text-[9px] text-cream-500">{a.name}</span>
                </a>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
