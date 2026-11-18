import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

const emojiSchema = z.object({ emoji: z.string().min(1).max(16) });

const ALLOWED = new Set(["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = emojiSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");
  if (!ALLOWED.has(parsed.data.emoji)) return jsonError(400, "Unsupported emoji");
  const store = getStore();
  await store.toggleEmojiReaction(id, user.id, parsed.data.emoji);
  return NextResponse.json({ ok: true });
}
