import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const store = getStore();
  const conversation = await store.getConversationForUser(id, user.id);
  if (!conversation) return jsonError(404, "Conversation not found");
  const members = await store.listMembers(id);
  return NextResponse.json({
    conversation,
    members,
    myRole: await store.getMemberRole(id, user.id),
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export async function PATCH(
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");
  const store = getStore();
  const conversation = await store.getConversationForUser(id, user.id);
  if (!conversation) return jsonError(404, "Conversation not found");
  if (conversation.type !== "group") return jsonError(400, "Only groups can be edited");
  const role = await store.getMemberRole(id, user.id);
  if (role !== "owner" && role !== "admin") {
    return jsonError(403, "Only group owner or admins can change group settings");
  }
  if (parsed.data.name) await store.renameConversation(id, parsed.data.name);
  if (parsed.data.avatarColor) await store.setConversationAvatarColor(id, parsed.data.avatarColor);
  return NextResponse.json({ ok: true });
}
