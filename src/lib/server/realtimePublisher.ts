/**
 * Publishes reaction metadata to Supabase Realtime Broadcast.
 * No message contents are published — metadata only.
 * No-op when Supabase env vars are not configured (local dev, CI).
 */
import type { ReactionEvent } from "@/lib/client/realtime";

let publisher: import("@supabase/supabase-js").SupabaseClient | null | undefined;

async function getPublisher() {
  if (publisher !== undefined) return publisher;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    publisher = null;
    return null;
  }
  const { createClient } = await import("@supabase/supabase-js");
  publisher = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return publisher;
}

export async function publishReactionUpdate(
  conversationId: string,
  event: Omit<ReactionEvent, "conversationId">
): Promise<void> {
  try {
    const sb = await getPublisher();
    if (!sb) return;
    const channel = sb.channel(`reaction:${conversationId}`);
    await channel.subscribe();
    await channel.send({
      type: "broadcast",
      event: "reaction-updated",
      payload: { ...event, conversationId },
    });
    await sb.removeChannel(channel);
  } catch (error) {
    // Realtime delivery must never break the analysis pipeline.
    console.error(
      "[realtime] publish failed",
      error instanceof Error ? error.message : String(error)
    );
  }
}
