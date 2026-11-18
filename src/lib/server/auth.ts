/**
 * Authentication: local mode (signed cookie + scrypt) or Supabase Auth when
 * configured. Server-side only. Passwords are never stored in plain text.
 */
import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getStore } from "./store";
import type { ProfileRow } from "./types";

const SESSION_COOKIE = "chesschat_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-only-insecure-secret";
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltB64, hashB64] = stored.split(":");
    if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    const derived = scryptSync(password, salt, expected.length);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

interface SessionPayload {
  uid: string;
  exp: number;
}

export function createSessionToken(userId: string): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (sign(encoded) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as SessionPayload;
    if (!payload.uid || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Read the current session user from cookies (server components / route handlers). */
export async function getSessionUser(): Promise<ProfileRow | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const store = getStore();
  return await store.getProfileById(payload.uid);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const jar = await cookies();
  // Secure by default in production; set SESSION_COOKIE_SECURE=false when
  // serving over plain http (e.g. local `next start` smoke tests).
  const secure =
    process.env.SESSION_COOKIE_SECURE !== undefined
      ? process.env.SESSION_COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production";
  jar.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
