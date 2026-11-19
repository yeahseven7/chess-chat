import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";
import { enqueueAnalysis, processAnalysisQueue } from "@/lib/ai/pipeline";
import { stripMockDirective } from "@/lib/ai/mock";

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
  const content =
    (process.env.AI_PROVIDER ?? "gemini").toLowerCase() === "mock"
      ? stripMockDirective(parsed.data.content)
      : parsed.data.content;
  if (!content.trim()) return jsonError(400, "Message must not be empty");
  const store = getStore();
  // Ownership is enforced inside editMessage.
  const updated = await store.editMessage(id, user.id, content);
  if (!updated) return jsonError(403, "You can only edit your own messages");
  // Edited content is re-analyzed (new job replaces any stale classification).
  await enqueueAnalysis(updated.id);
  after(() => {
    void processAnalysisQueue(5).catch(() => undefined);
  });
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
