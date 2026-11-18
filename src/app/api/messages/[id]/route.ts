import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";
import { enqueueAnalysis, processAnalysisQueue } from "@/lib/ai/pipeline";

const editSchema = z.object({ content: z.string().min(1).max(4000) });

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
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Message must be 1–4000 characters");
  const store = getStore();
  // Ownership is enforced inside editMessage.
  const updated = await store.editMessage(id, user.id, parsed.data.content);
  if (!updated) return jsonError(403, "You can only edit your own messages");
  // Edited content is re-analyzed (new job replaces any stale classification).
  enqueueAnalysis(updated.id);
  void processAnalysisQueue(3).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const store = getStore();
  const ok = await store.deleteMessage(id, user.id);
  if (!ok) return jsonError(403, "You can only delete your own messages");
  return NextResponse.json({ ok: true });
}
