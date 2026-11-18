import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";
import { processAnalysisQueue } from "@/lib/ai/pipeline";
import { rateLimit } from "@/lib/server/rateLimit";

const schema = z.object({ messageId: z.string().min(1).max(80) });

/** Re-enqueue a failed analysis job for a message. Members of the conversation may retry. */
export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const limited = rateLimit(`requeue:${user.id}`, 20, 60);
  if (!limited.allowed) return jsonError(429, "Too many requests");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input");

  const store = getStore();
  const ctx = await store.getMessageForAnalysis(parsed.data.messageId);
  // Deleted/missing messages can't be reanalyzed; still return ok=false.
  if (!ctx) return jsonError(404, "Message not found");
  if (!await store.getConversationForUser(ctx.message.conversationId, user.id)) {
    return jsonError(404, "Conversation not found");
  }
  const requeued = await store.requeueFailedJob(parsed.data.messageId);
  if (requeued) void processAnalysisQueue(3).catch(() => undefined);
  return NextResponse.json({ requeued });
}
