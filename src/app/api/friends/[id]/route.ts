import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

const respondSchema = z.object({ action: z.enum(["accept", "reject"]) });

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
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");
  const store = getStore();
  const updated = await store.respondFriendRequest(id, user.id, parsed.data.action === "accept");
  if (!updated) return jsonError(404, "Request not found or not yours");
  return NextResponse.json({ friendship: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const store = getStore();
  // `id` here is the other user's id — removes the friendship in either direction.
  await store.removeFriendship(user.id, id);
  return NextResponse.json({ ok: true });
}
