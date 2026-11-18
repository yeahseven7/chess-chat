import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { hashPassword, setSessionCookie } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[A-Za-z0-9_]+$/, "Username may contain letters, digits and underscores only"),
  displayName: z.string().min(1).max(60),
  password: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  const limited = rateLimit(`register:${request.headers.get("x-forwarded-for") ?? "local"}`, 20, 600);
  if (!limited.allowed) return jsonError(429, "Too many attempts. Try again later.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { username, displayName, password } = parsed.data;
  const store = getStore();
  if (await store.getProfileByUsername(username)) {
    return jsonError(409, "Username is already taken");
  }
  try {
    const user = await store.createProfile({
      id: randomUUID(),
      username,
      displayName,
      passwordHash: hashPassword(password),
    });
    await setSessionCookie(user.id);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("[register] failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not create the account");
  }
}
