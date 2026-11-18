import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { requireUser } from "@/lib/server/http";

export async function POST() {
  const { user, error } = await requireUser();
  if (error) return error;
  getStore().markNotificationsRead(user.id);
  return NextResponse.json({ ok: true });
}
