import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const store = getStore();
  if (!await store.getConversationForUser(id, user.id)) {
    return jsonError(404, "Conversation not found");
  }
  await store.markConversationRead(id, user.id);
  return NextResponse.json({ ok: true });
}
