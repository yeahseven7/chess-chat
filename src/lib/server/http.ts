import { NextResponse } from "next/server";
import { getSessionUser } from "./auth";
import type { ProfileRow } from "./types";

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

/** Returns the session user or a 401 response. */
export async function requireUser(): Promise<
  { user: ProfileRow; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) return { error: jsonError(401, "Not authenticated") };
  return { user };
}

export function safeString(value: unknown, max = 5000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function isValidId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,80}$/.test(value);
}
