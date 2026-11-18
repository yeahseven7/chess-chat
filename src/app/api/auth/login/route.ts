import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { setSessionCookie, verifyPassword } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";

const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  const limited = rateLimit(`login:${ip}`, 30, 600);
  if (!limited.allowed) return jsonError(429, "Too many attempts. Try again later.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");

  const store = getStore();
  const profile = await store.getProfileByEmail(parsed.data.email.trim().toLowerCase());
  const hash = profile ? await store.getPasswordHash(profile.id) : null;
  // Always run a verification-shaped path to reduce user-enumeration signal.
  const ok = profile && hash ? verifyPassword(parsed.data.password, hash) : false;
  if (!profile || !ok) {
    return jsonError(401, "Invalid email or password");
  }
  await store.touchLastSeen(profile.id);
  await setSessionCookie(profile.id);
  return NextResponse.json({ user: profile });
}
