import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { getStore } from "@/lib/server/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  const store = getStore();
  await store.touchLastSeen(user.id);
  const unreadNotifications = await store.unreadNotificationCount(user.id);
  return NextResponse.json({ user, unreadNotifications });
}
