"use client";

import { useState } from "react";
import {
  Reply,
  Pencil,
  Trash2,
  RefreshCcw,
  File as FileIcon,
  Download,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { Avatar } from "./Avatar";
import { ReactionBadge } from "./ReactionBadge";
import type { MessageView } from "@/lib/server/types";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏"];

interface MessageItemProps {
  message: MessageView;
  isMine: boolean;
  isGroup: boolean;
  onReply: (m: MessageView) => void;
  onEdit: (m: MessageView) => void;
  onChanged: () => void;
  /** Optimistic row waiting for persistence confirmation. */
  sending?: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageItem({ message, isMine, isGroup, onReply, onEdit, onChanged, sending }: MessageItemProps) {
  const [busy, setBusy] = useState(false);
  const [showActions, setShowActions] = useState(false);

  async function toggleEmoji(emoji: string) {
    try {
      await api(`/api/messages/${message.id}/emoji`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
      onChanged();
    } catch {
      /* non-fatal */
    }
  }

  async function remove() {
    if (!confirm("Delete this message?")) return;
    setBusy(true);
    try {
      await api(`/api/messages/${message.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function retryAnalysis() {
    setBusy(true);
    try {
      await api("/api/analysis/requeue", {
        method: "POST",
        body: JSON.stringify({ messageId: message.id }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (message.deletedAt) {
    return (
      <div className={`px-4 py-0.5 ${isMine ? "text-right" : "text-left"}`}>
        <span className="text-xs italic text-cream-600">Message deleted</span>
      </div>
    );
  }

  const pending = message.analysisStatus === "pending" || message.analysisStatus === "processing";
  const failed = message.analysisStatus === "failed";
  const isOptimistic = sending === true;

  return (
    <div
      className={`group flex w-full gap-2.5 px-3 py-1.5 sm:px-4 ${isMine ? "flex-row-reverse" : ""}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      data-testid="message-row"
    >
      {!isMine && (
        <div className="mt-0.5">
          <Avatar
            name={message.sender?.displayName ?? "?"}
            color={message.sender?.avatarColor}
            url={message.sender?.avatarUrl}
            size={32}
          />
        </div>
      )}

      <div className={`flex max-w-[78%] flex-col sm:max-w-[68%] ${isMine ? "items-end" : "items-start"}`}>
        {(isGroup || !isMine) && message.sender && (
          <span className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-cream-500">
            {message.sender.displayName}
          </span>
        )}

        {/* reply preview */}
        {message.replyTo && (
          <div
            className={`mb-1 max-w-full rounded-md border-l-2 border-accent bg-ink-700 px-2 py-1 text-[11px] text-cream-500 ${
              isMine ? "rounded-tr-none" : "rounded-tl-none"
            }`}
          >
            <span className="line-clamp-1">{message.replyTo.content || "Message"}</span>
          </div>
        )}

        {/* bubble + AI reaction */}
        <div className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
          <div
            className={`rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm ${
              isMine
                ? "rounded-br-sm bg-accent-dark text-cream-100"
                : "rounded-bl-sm bg-ink-600 text-cream-100"
            }`}
          >
            <span className="whitespace-pre-wrap break-words">{message.content}</span>

            {/* attachments */}
            {message.attachments.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {message.attachments.map((att) =>
                  att.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={att.id}
                      src={`/api/files/${att.id}`}
                      alt={att.name}
                      className="max-h-56 max-w-full rounded-lg border border-ink-500 object-cover"
                    />
                  ) : (
                    <a
                      key={att.id}
                      href={`/api/files/${att.id}`}
                      download={att.name}
                      className="flex items-center gap-2 rounded-lg border border-ink-500 bg-ink-700 px-2 py-1.5 text-xs text-cream-300 hover:text-cream-100"
                    >
                      <FileIcon size={14} aria-hidden="true" />
                      <span className="max-w-[180px] truncate">{att.name}</span>
                      <Download size={12} aria-hidden="true" />
                    </a>
                  )
                )}
              </div>
            )}

            <div className="mt-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-cream-500">
              <span>{formatTime(message.createdAt)}</span>
              {message.editedAt && <span>· edited</span>}
              {isOptimistic && (
                <span className="text-accent" aria-label="Sending…">· sending…</span>
              )}
            </div>
          </div>

          {/* AI reaction */}
          <div className="mb-0.5 flex h-6 w-6 items-center justify-center" data-testid="ai-reaction">
            {message.reaction ? (
              <ReactionBadge
                category={message.reaction.category as Parameters<typeof ReactionBadge>[0]["category"]}
                confidence={message.reaction.confidence}
                reason={message.reaction.reason}
                createdAt={message.reaction.createdAt}
              />
            ) : isOptimistic ? (
              <span className="h-[22px] w-[22px]" aria-hidden="true" />
            ) : pending ? (
              <span
                className="analysis-pending flex h-[22px] w-[22px] items-center justify-center rounded-full"
                title="Analyzing…"
                aria-label="Analysis pending"
              >
                <Loader2 size={12} className="animate-spin text-cream-500" />
              </span>
            ) : failed ? (
              <button
                onClick={retryAnalysis}
                disabled={busy}
                title="Analysis failed — click to retry"
                aria-label="Analysis failed, retry"
                className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-ink-500 text-cream-500 transition-colors hover:border-cream-500 hover:text-cream-100"
              >
                <RefreshCcw size={11} />
              </button>
            ) : null}
          </div>
        </div>

        {/* emoji reactions */}
        {message.emojiReactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1 px-1">
            {message.emojiReactions.map((er) => (
              <button
                key={er.emoji}
                onClick={() => toggleEmoji(er.emoji)}
                aria-pressed={er.reactedByMe}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
                  er.reactedByMe
                    ? "border-accent bg-accent-dark/60 text-cream-100"
                    : "border-ink-500 bg-ink-700 text-cream-300 hover:border-cream-600"
                }`}
              >
                <span>{er.emoji}</span>
                <span className="tabular-nums">{er.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* hover action bar */}
        {!isOptimistic && (
          <div
            className={`mt-1 flex items-center gap-0.5 rounded-md border border-ink-500 bg-ink-700 px-1 py-0.5 shadow transition-opacity ${
              showActions ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <button onClick={() => onReply(message)} title="Reply" aria-label="Reply" className="rounded p-1.5 text-cream-500 hover:bg-ink-600 hover:text-cream-100">
              <Reply size={14} />
            </button>
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => toggleEmoji(e)}
                title={`React ${e}`}
                aria-label={`React with ${e}`}
                className="rounded p-1 text-xs hover:bg-ink-600"
              >
                {e}
              </button>
            ))}
            {isMine && (
              <>
                <button onClick={() => onEdit(message)} title="Edit" aria-label="Edit message" className="rounded p-1.5 text-cream-500 hover:bg-ink-600 hover:text-cream-100">
                  <Pencil size={14} />
                </button>
                <button onClick={remove} title="Delete" aria-label="Delete message" className="rounded p-1.5 text-cream-500 hover:bg-ink-600 hover:text-[#ff9d8f]">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
