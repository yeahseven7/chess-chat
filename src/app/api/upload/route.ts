import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_IMAGE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const ALLOWED_FILE = new Set([
  ...ALLOWED_IMAGE,
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

const uploadDir = () =>
  process.env.LOCAL_UPLOAD_DIR ?? path.join(process.cwd(), ".localdata", "uploads");

export async function POST(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Expected multipart form data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "Missing file");
  if (file.size === 0) return jsonError(400, "Empty file");
  if (file.size > MAX_SIZE) return jsonError(413, "File exceeds the 8 MB limit");

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_FILE.has(mime)) return jsonError(415, "Unsupported file type");
  const kind = ALLOWED_IMAGE.has(mime) ? "image" : "file";

  const id = randomUUID();
  const ext = path.extname(file.name || "").slice(0, 10).replace(/[^.a-zA-Z0-9]/g, "");
  const relative = `${id}${ext}`;
  const dir = uploadDir();
  try {
    await fs.mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(dir, relative), buffer);
  } catch (err) {
    console.error("[upload] failed", err instanceof Error ? err.message : err);
    return jsonError(500, "Could not store the file");
  }

  const store = getStore();
  const attachment = await store.createAttachment({
    id,
    uploaderId: user.id,
    kind,
    name: (file.name || "file").slice(0, 200),
    mimeType: mime,
    size: file.size,
    path: relative,
  });
  return NextResponse.json({ attachment }, { status: 201 });
}
