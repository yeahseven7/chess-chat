import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const store = getStore();
  return NextResponse.json({
    friends: await store.listFriends(user.id),
    requests: await store.listFriendRequests(user.id),
  });
}

const sendSchema = z.object({ addresseeId: z.string().min(1).max(80) });

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");
  const { addresseeId } = parsed.data;
  if (addresseeId === user.id) return jsonError(400, "You cannot add yourself");
  const store = getStore();
  if (!await store.getProfileById(addresseeId)) return jsonError(404, "User not found");
  if (await store.isBlocked(user.id, addresseeId)) return jsonError(403, "Cannot send a friend request");
  try {
    const { friendship, autoAccepted } = await store.sendFriendRequest(user.id, addresseeId);
    return NextResponse.json({ friendship, autoAccepted }, { status: 201 });
  } catch {
    return jsonError(409, "Unable to send a friend request");
  }
}
