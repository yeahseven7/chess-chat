import { NextRequest, NextResponse } from "next/server";
import { getStore, setTyping, getTyping } from "@/lib/server/store";
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
  setTyping(id, user.id);
  await store.touchLastSeen(user.id);
  return NextResponse.json({ ok: true });
}

export async function GET(
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
  const typing = getTyping(id, user.id);
  const members = await store.listMembers(id);
  const profiles = members
    .filter((m) => typing.includes(m.userId))
    .map((m) => ({ id: m.userId, displayName: m.profile.displayName }));
  return NextResponse.json({ typing: profiles });
}
