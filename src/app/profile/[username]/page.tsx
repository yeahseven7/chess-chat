import { redirect } from "next/navigation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { getSessionUser } from "@/lib/server/auth";
import { getStore } from "@/lib/server/store";
import { Avatar } from "@/components/Avatar";
import { GlyphPath } from "@/components/ReactionGlyph";
import { REACTION_LIST, REACTION_CATEGORIES } from "@/shared/reactions";
import { ProfileActions } from "./ProfileActions";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const me = await getSessionUser();
  if (!me) redirect("/login");

  const store = getStore();
  const profile = await store.getProfileByUsername(username);
  if (!profile) notFound();

  const stats = await store.userStats(profile.id);
  const friendsCount = (await store.listFriends(profile.id)).length;
  const friendship = await store.getFriendshipBetween(me.id, profile.id);
  const blocked = await store.isBlocked(me.id, profile.id);
  const online = Date.now() - new Date(profile.lastSeenAt).getTime() < 2 * 60 * 1000;
  const isSelf = profile.id === me.id;
  const maxCount = Math.max(1, ...REACTION_CATEGORIES.map((c) => stats.counts[c]));

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between">
        <Link
          href="/app"
          className="flex items-center gap-2 text-sm text-cream-500 hover:text-cream-100"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to chats
        </Link>
        {!isSelf && (
          <Link
            href="/app"
            className="flex items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-1.5 text-xs font-semibold text-cream-300 hover:border-accent hover:text-accent"
          >
            <MessageSquare size={13} aria-hidden="true" /> Chat
          </Link>
        )}
      </div>

      {/* identity card */}
      <section className="mt-4 rounded-2xl border border-ink-500 bg-ink-700 p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={profile.displayName} color={profile.avatarColor} url={profile.avatarUrl} size={96} online={online} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-extrabold text-cream-100">{profile.displayName}</h1>
            <p className="text-sm text-cream-500">@{profile.username}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-cream-600">
              {online ? "● Online now" : "Offline"}
            </p>
            {profile.bio && <p className="mt-3 max-w-md text-sm leading-relaxed text-cream-300">{profile.bio}</p>}
          </div>
          {!isSelf && (
            <ProfileActions
              targetId={profile.id}
              targetName={profile.displayName}
              friendshipStatus={friendship?.status ?? null}
              friendshipId={friendship?.id ?? null}
              blocked={blocked}
            />
          )}
        </div>

        <dl className="mt-6 grid grid-cols-3 divide-x divide-ink-500 rounded-xl border border-ink-500 text-center">
          {[
            { label: "Friends", value: friendsCount },
            { label: "Messages sent", value: stats.totalSent },
            { label: "Messages analyzed", value: stats.totalAnalyzed },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col px-2 py-4">
              <dd className="text-xl font-extrabold tabular-nums text-cream-100">{value}</dd>
              <dt className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-cream-500">
                {label}
              </dt>
            </div>
          ))}
        </dl>
      </section>

      {/* reaction distribution */}
      <section className="mt-4 rounded-2xl border border-ink-500 bg-ink-700 p-6" aria-label="Reaction distribution">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-cream-500">
            Reaction distribution
          </h2>
          <span className="text-xs text-cream-600">
            {stats.positive} positive · {stats.negative} negative
          </span>
        </div>

        <ul className="mt-4 space-y-2">
          {REACTION_LIST.map((r) => {
            const count = stats.counts[r.category];
            const pct = Math.round((count / maxCount) * 100);
            return (
              <li key={r.category} className="flex items-center gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: r.color }}
                  title={r.label}
                >
                  <svg width={15} height={15} viewBox="0 0 24 24" aria-hidden="true">
                    <GlyphPath glyph={r.glyph} />
                  </svg>
                </span>
                <span className="w-20 shrink-0 text-xs font-medium text-cream-300">{r.label}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                  <span
                    className="block h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: r.color }}
                    role="presentation"
                  />
                </span>
                <span className="w-8 text-right text-sm font-bold tabular-nums text-cream-100">{count}</span>
              </li>
            );
          })}
        </ul>
        {stats.totalAnalyzed === 0 && (
          <p className="mt-3 text-center text-xs text-cream-600">
            No analyzed messages yet — send a message and the AI will review it.
          </p>
        )}
      </section>
    </main>
  );
}
