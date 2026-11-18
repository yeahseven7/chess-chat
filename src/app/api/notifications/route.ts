import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { requireUser } from "@/lib/server/http";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const store = getStore();
  return NextResponse.json({
    notifications: await store.listNotifications(user.id, 40),
    unread: await store.unreadNotificationCount(user.id),
  });
}
