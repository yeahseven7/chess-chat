import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { requireUser, jsonError } from "@/lib/server/http";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { username } = await params;
  const store = getStore();
  const profile = await store.getProfileByUsername(username);
  if (!profile) return jsonError(404, "User not found");
  const stats = await store.userStats(profile.id);
  const friendship = await store.getFriendshipBetween(user.id, profile.id);
  const friends = await store.listFriends(profile.id);
  const friendsCount = friends.length;
  const blocked = await store.isBlocked(user.id, profile.id);
  const online =
    Date.now() - new Date(profile.lastSeenAt).getTime() < 2 * 60 * 1000;
  return NextResponse.json({
    profile: { ...profile, online, blocked },
    stats,
    friendsCount,
    friendshipStatus: friendship?.status ?? null,
    friendshipDirection: friendship
      ? friendship.status === "pending"
        ? friendship.requesterId === user.id
          ? "outgoing"
          : "incoming"
        : null
      : null,
    friendshipId: friendship?.id ?? null,
    isSelf: profile.id === user.id,
  });
}
