"use client";

import { useEffect, useState } from "react";
import { X, Search, Check, UserPlus, Loader2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { Avatar } from "./Avatar";
import type { ProfileRow } from "@/lib/server/types";

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-ink-500 bg-ink-700 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-cream-100">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-cream-500 hover:bg-ink-600 hover:text-cream-100">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function UserSearchList({
  onPick,
  actionLabel,
}: {
  onPick: (user: ProfileRow) => void;
  actionLabel: (user: ProfileRow) => string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileRow[]>([]);
  const [suggestions, setSuggestions] = useState<ProfileRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ users: ProfileRow[] }>("/api/users/suggest")
      .then((d) => setSuggestions(d.users))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      api<{ users: ProfileRow[] }>(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.users))
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const shown = query.trim() ? results : suggestions;
  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-ink-500 bg-ink-800 px-3 py-2">
        <Search size={15} className="text-cream-500" aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username or name…"
          aria-label="Search users"
          className="w-full bg-transparent text-sm text-cream-100 outline-none placeholder-cream-600"
        />
        {busy && <Loader2 size={14} className="animate-spin text-cream-500" />}
      </div>
      <ul className="mt-2 divide-y divide-ink-600">
        {shown.map((u) => (
          <li key={u.id} className="flex items-center gap-3 py-2">
            <Avatar name={u.displayName} color={u.avatarColor} url={u.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-cream-100">{u.displayName}</p>
              <p className="truncate text-xs text-cream-500">@{u.username}</p>
            </div>
            <button
              onClick={() => onPick(u)}
              className="flex items-center gap-1 rounded-lg border border-ink-500 px-2 py-1.5 text-xs font-semibold text-cream-100 hover:border-accent hover:text-accent"
            >
              <UserPlus size={13} aria-hidden="true" />
              {actionLabel(u)}
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="py-6 text-center text-xs text-cream-600">
            {query.trim() ? "No users found." : "No suggestions right now."}
          </li>
        )}
      </ul>
    </div>
  );
}

export function NewDirectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  return (
    <ModalShell title="New direct message" onClose={onClose}>
      <UserSearchList
        actionLabel={() => "Message"}
        onPick={async (u) => {
          const { conversation } = await api<{ conversation: { id: string } }>("/api/conversations", {
            method: "POST",
            body: JSON.stringify({ type: "direct", userId: u.id }),
          });
          onCreated(conversation.id);
          onClose();
        }}
      />
    </ModalShell>
  );
}

export function NewGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<ProfileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { conversation } = await api<{ conversation: { id: string } }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ type: "group", name: name.trim(), memberIds: members.map((m) => m.id) }),
      });
      onCreated(conversation.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create group");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Create group" onClose={onClose}>
      <label htmlFor="group-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-cream-500">
        Group name
      </label>
      <input
        id="group-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Study Group"
        className="w-full rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-cream-100 outline-none focus:border-accent"
      />
      {members.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {members.map((m) => (
            <span key={m.id} className="flex items-center gap-1 rounded-full border border-ink-500 bg-ink-800 py-0.5 pl-1 pr-2 text-xs text-cream-100">
              <Avatar name={m.displayName} color={m.avatarColor} size={18} />
              {m.displayName}
              <button aria-label={`Remove ${m.displayName}`} onClick={() => setMembers((v) => v.filter((x) => x.id !== m.id))} className="ml-0.5 text-cream-500 hover:text-cream-100">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-3">
        <UserSearchList
          actionLabel={() => "Add"}
          onPick={(u) => setMembers((v) => (v.some((m) => m.id === u.id) ? v : [...v, u]))}
        />
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-[#ff9d8f]">{error}</p>}
      <button
        onClick={create}
        disabled={busy || !name.trim() || members.length === 0}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-[#1b1917] hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        Create group
      </button>
    </ModalShell>
  );
}

export function SettingsModal({
  me,
  onClose,
  onSaved,
}: {
  me: ProfileRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [avatarColor, setAvatarColor] = useState(me.avatarColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const COLORS = ["#81b64c", "#4a9ae8", "#e8a33d", "#d0342c", "#9a6ae8", "#3fa9a0", "#e0704f", "#c8c5c1"];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName, bio, avatarColor }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Settings" onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar name={displayName} color={avatarColor} url={me.avatarUrl} size={64} />
        <div>
          <p className="text-xs text-cream-500">@{me.username}</p>
          <p className="text-[10px] uppercase tracking-wide text-cream-600">Avatar color</p>
          <div className="mt-1 flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Avatar color ${c}`}
                aria-pressed={avatarColor === c}
                onClick={() => setAvatarColor(c)}
                className={`h-5 w-5 rounded-full ring-2 transition ${avatarColor === c ? "ring-cream-100" : "ring-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
      <label htmlFor="settings-name" className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-wide text-cream-500">
        Display name
      </label>
      <input
        id="settings-name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="w-full rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-cream-100 outline-none focus:border-accent"
      />
      <label htmlFor="settings-bio" className="mb-1 mt-3 block text-xs font-semibold uppercase tracking-wide text-cream-500">
        Bio
      </label>
      <textarea
        id="settings-bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={3}
        maxLength={280}
        className="w-full resize-none rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-cream-100 outline-none focus:border-accent"
      />
      {error && <p role="alert" className="mt-2 text-xs text-[#ff9d8f]">{error}</p>}
      <button
        onClick={save}
        disabled={busy || !displayName.trim()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-[#1b1917] hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        Save changes
      </button>
    </ModalShell>
  );
}
