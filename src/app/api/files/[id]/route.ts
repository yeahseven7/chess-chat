import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

const uploadDir = () =>
  process.env.LOCAL_UPLOAD_DIR ?? path.join(process.cwd(), ".localdata", "uploads");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return jsonError(400, "Invalid id");

  const store = getStore();
  const attachment = await store.getAttachment(id);
  if (!attachment) return jsonError(404, "File not found");

  // Authorization: uploader may always read their unlinked file; otherwise the
  // file must belong to a message in a conversation the user belongs to.
  let allowed = attachment.uploaderId === user.id && attachment.messageId === null;
  if (!allowed && attachment.messageId) {
    const convId = await store.getConversationIdForMessage(attachment.messageId);
    allowed = !!convId && !!await store.getConversationForUser(convId, user.id);
  }
  if (!allowed) return jsonError(403, "Not allowed");

  const absolute = path.join(uploadDir(), path.basename(attachment.path));
  try {
    const data = await fs.readFile(absolute);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.name)}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return jsonError(404, "File is missing from storage");
  }
}
