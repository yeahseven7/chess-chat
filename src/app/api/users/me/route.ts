import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

const patchSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  bio: z.string().max(280).optional(),
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");
  const store = getStore();
  const updated = await store.updateProfile(user.id, parsed.data);
  return NextResponse.json({ user: updated });
}
