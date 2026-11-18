"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogoMark } from "@/components/ReactionGlyph";
import { REACTION_LIST } from "@/shared/reactions";
import { GlyphPath } from "@/components/ReactionGlyph";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(
    searchParams.get("mode") === "register" ? "register" : "login"
  );
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register" ? { username, displayName, password } : { username, password }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: value proposition */}
      <div className="relative hidden flex-col justify-between border-r border-ink-500 bg-ink-700 p-10 lg:flex">
        <div className="flex items-center gap-3">
          <LogoMark size={40} />
          <span className="text-2xl font-bold tracking-tight text-cream-100">ChessChat</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-extrabold leading-[1.15] text-cream-100">
            Every message,
            <br />
            reviewed like a chess move.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-cream-500">
            ChessChat watches each message with a neutral AI and marks it with one of six
            chess-review reactions — Best, Great, Excellent, Mistake, Miss, or Blunder.
            Playful, not punitive: your words are never edited or censored.
          </p>
          <div className="mt-8 flex items-center gap-2.5">
            {REACTION_LIST.map((r) => (
              <div
                key={r.category}
                title={r.label}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow"
                style={{ background: r.color }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
                  <GlyphPath glyph={r.glyph} />
                </svg>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-cream-600">
          AI reactions are a playful signal, not moderation. Messages are processed by the
          configured AI provider to generate reactions — see{" "}
          <Link href="/privacy" className="underline hover:text-cream-300">
            how your data is handled
          </Link>
          .
        </p>
      </div>

      {/* Right: auth card */}
      <div className="flex items-center justify-center bg-ink-800 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark size={36} />
            <span className="text-xl font-bold text-cream-100">ChessChat</span>
          </div>
          <h2 className="text-2xl font-bold text-cream-100">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-1 text-sm text-cream-500">
            {mode === "login"
              ? "Log in to continue the conversation."
              : "Pick a username and start chatting."}
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-lg bg-ink-700 p-1 text-sm font-medium">
            <button
              onClick={() => setMode("login")}
              aria-pressed={mode === "login"}
              className={`rounded-md px-4 py-2 transition-colors ${
                mode === "login" ? "bg-ink-500 text-cream-100" : "text-cream-500 hover:text-cream-100"
              }`}
            >
              Log in
            </button>
            <button
              onClick={() => setMode("register")}
              aria-pressed={mode === "register"}
              className={`rounded-md px-4 py-2 transition-colors ${
                mode === "register" ? "bg-ink-500 text-cream-100" : "text-cream-500 hover:text-cream-100"
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-cream-500">
                Username
              </label>
              <input
                id="username"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-ink-500 bg-ink-700 px-3 py-2.5 text-sm text-cream-100 placeholder-cream-600 outline-none focus:border-accent"
                placeholder="e.g. aisha"
              />
            </div>
            {mode === "register" && (
              <div>
                <label htmlFor="displayName" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-cream-500">
                  Display name
                </label>
                <input
                  id="displayName"
                  autoComplete="name"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-ink-500 bg-ink-700 px-3 py-2.5 text-sm text-cream-100 placeholder-cream-600 outline-none focus:border-accent"
                  placeholder="Aisha Bekova"
                />
              </div>
            )}
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-cream-500">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "register" ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-ink-500 bg-ink-700 px-3 py-2.5 text-sm text-cream-100 placeholder-cream-600 outline-none focus:border-accent"
                placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-[#d0342c]/40 bg-[#d0342c]/10 px-3 py-2 text-sm text-[#ff9d8f]">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-[#1b1917] transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-cream-600">
            By continuing you agree that messages are analyzed by AI to generate reactions.
            See <Link href="/privacy" className="underline hover:text-cream-300">Privacy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
