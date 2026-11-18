import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const store = getStore();
  return NextResponse.json({ conversations: await store.listConversations(user.id) });
}

const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("direct"), userId: z.string().min(1).max(80) }),
  z.object({
    type: z.literal("group"),
    name: z.string().min(1).max(80),
    memberIds: z.array(z.string().min(1).max(80)).min(1).max(50),
  }),
]);

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");
  const store = getStore();

  if (parsed.data.type === "direct") {
    const otherId = parsed.data.userId;
    if (otherId === user.id) return jsonError(400, "You cannot message yourself");
    if (!await store.getProfileById(otherId)) return jsonError(404, "User not found");
    if (await store.isBlocked(user.id, otherId)) return jsonError(403, "You cannot message this user");
    const conversation = await store.createDirectConversation(user.id, otherId);
    return NextResponse.json({ conversation }, { status: 201 });
  }

  const { name, memberIds } = parsed.data;
  const allowed: string[] = [];
  for (const id of memberIds) {
    if (id === user.id) continue;
    if (!(await store.getProfileById(id))) continue;
    if (await store.isBlocked(user.id, id)) continue;
    allowed.push(id);
  }
  if (allowed.length === 0) return jsonError(400, "A group needs at least one other member");
  const conversation = await store.createGroup(name, user.id, allowed);
  return NextResponse.json({ conversation }, { status: 201 });
}
