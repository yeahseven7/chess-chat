import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";
import { kickOffAnalysis, processAnalysisQueue } from "@/lib/ai/pipeline";
import { rateLimit } from "@/lib/server/rateLimit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const store = getStore();
  if (!await store.getConversationForUser(id, user.id)) {
    return jsonError(404, "Conversation not found");
  }
  const url = request.nextUrl;
  const after = url.searchParams.get("after") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "100");
  // Opportunistically drain due analysis jobs so reactions appear promptly.
  void processAnalysisQueue(3).catch(() => undefined);
  const messages = await store.listMessages(id, user.id, { after, limit, query: q ?? undefined });
  return NextResponse.json({ messages });
}

const sendSchema = z.object({
  content: z.string().min(1).max(4000),
  replyToId: z.string().max(80).nullish(),
  attachmentIds: z.array(z.string().max(80)).max(10).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const limited = rateLimit(`send:${user.id}`, 60, 60);
  if (!limited.allowed) return jsonError(429, "You are sending messages too fast");

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Message must be 1–4000 characters");

  const store = getStore();
  const conversation = await store.getConversationForUser(id, user.id);
  if (!conversation) return jsonError(404, "Conversation not found");

  if (conversation.type === "direct") {
    const members = await store.listMembers(id);
    const other = members.find((m) => m.userId !== user.id);
    if (other && await store.isBlocked(user.id, other.userId)) {
      return jsonError(403, "You cannot send messages in this conversation");
    }
  }

  const message = await store.createMessage({
    id: randomUUID(),
    conversationId: id,
    senderId: user.id,
    content: parsed.data.content,
    replyToId: parsed.data.replyToId ?? null,
    attachmentIds: parsed.data.attachmentIds ?? [],
  });
  if (!message) return jsonError(500, "Could not save the message");

  // Delivery must not wait for AI: enqueue + async drain.
  kickOffAnalysis(message.id);

  return NextResponse.json({ message }, { status: 201 });
}
