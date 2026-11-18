import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

const addSchema = z.object({ userId: z.string().min(1).max(80) });

async function requireGroupManager(conversationId: string, userId: string) {
  const store = getStore();
  const conversation = await store.getConversationForUser(conversationId, userId);
  if (!conversation) return { error: jsonError(404, "Conversation not found") };
  if (conversation.type !== "group") return { error: jsonError(400, "Not a group") };
  const role = await store.getMemberRole(conversationId, userId);
  if (role !== "owner" && role !== "admin") {
    return { error: jsonError(403, "Only the owner or admins can manage members") };
  }
  return { conversation, role };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const manager = await requireGroupManager(id, user.id);
  if (manager.error) return manager.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");
  const { userId } = parsed.data;
  const store = getStore();
  const target = await store.getProfileById(userId);
  if (!target) return jsonError(404, "User not found");
  if (await store.isBlocked(user.id, userId)) return jsonError(403, "User unavailable");
  if (await store.getMemberRole(id, userId)) return jsonError(409, "Already a member");
  await store.addGroupMember(id, userId, "member");
  await store.createNotification({
    userId,
    type: "group_invite",
    title: "Added to a group",
    body: `You were added to "${manager.conversation?.name ?? "a group"}".`,
    conversationId: id,
    actorId: user.id,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

const patchRoleSchema = z.object({
  userId: z.string().min(1).max(80),
  role: z.enum(["admin", "member"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const store = getStore();
  const conversation = await store.getConversationForUser(id, user.id);
  if (!conversation) return jsonError(404, "Conversation not found");
  if (conversation.type !== "group") return jsonError(400, "Not a group");
  if (await store.getMemberRole(id, user.id) !== "owner") {
    return jsonError(403, "Only the owner can change roles");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = patchRoleSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");
  if (parsed.data.userId === user.id) return jsonError(400, "The owner cannot change their own role");
  if (!await store.getMemberRole(id, parsed.data.userId)) return jsonError(404, "Member not found");
  await store.updateMemberRole(id, parsed.data.userId, parsed.data.role);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return jsonError(400, "userId is required");
  const store = getStore();
  const conversation = await store.getConversationForUser(id, user.id);
  if (!conversation) return jsonError(404, "Conversation not found");
  if (conversation.type !== "group") return jsonError(400, "Not a group");

  const removingSelf = userId === user.id;
  if (!removingSelf) {
    const role = await store.getMemberRole(id, user.id);
    const targetRole = await store.getMemberRole(id, userId);
    if (role !== "owner" && !(role === "admin" && targetRole === "member")) {
      return jsonError(403, "You cannot remove this member");
    }
    if (targetRole === "owner") return jsonError(400, "The owner cannot be removed");
  }
  await store.removeGroupMember(id, userId);
  return NextResponse.json({ ok: true });
}
