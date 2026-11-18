import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

const reportSchema = z.object({
  reportedId: z.string().min(1).max(80),
  reason: z.string().min(2).max(120),
  detail: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");
  const store = getStore();
  if (!await store.getProfileById(parsed.data.reportedId)) return jsonError(404, "User not found");
  await store.reportUser({
    reporterId: user.id,
    reportedId: parsed.data.reportedId,
    reason: parsed.data.reason,
    detail: parsed.data.detail ?? "",
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
