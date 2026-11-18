import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });
  const store = getStore();
  const results = await store.searchProfiles(q, user.id, 12);
  const visible = [];
  for (const p of results) {
    if (!(await store.isBlocked(user.id, p.id))) visible.push(p);
  }
  return NextResponse.json({ users: visible });
}
