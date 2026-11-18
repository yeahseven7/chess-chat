import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { requireUser } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const store = getStore();
  return NextResponse.json({ results: await store.searchMyMessages(user.id, q, 30) });
}
