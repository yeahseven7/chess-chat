import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

const blockSchema = z.object({ userId: z.string().min(1).max(80) });

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = blockSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");
  if (parsed.data.userId === user.id) return jsonError(400, "You cannot block yourself");
  const store = getStore();
  await store.blockUser(user.id, parsed.data.userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return jsonError(400, "userId is required");
  getStore().unblockUser(user.id, userId);
  return NextResponse.json({ ok: true });
}
