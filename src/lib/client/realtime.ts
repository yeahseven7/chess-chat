"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ReactionRow } from "@/lib/server/types";

/**
 * Realtime delivery for AI reaction updates.
 *
 * The server publishes a `reaction-updated` Broadcast event on the channel
 * `reaction:{conversationId}` (service role, metadata only: messageId,
 * category, confidence, createdAt). Subscribing requires no Supabase Auth —
 * knowing the (unguessable) conversation UUID is enough. The payload contains
 * no message contents, so exposure is limited to reaction metadata.
 *
 * When NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not
 * configured (local dev, CI), this degrades to a no-op and the UI relies on
 * the regular poll cycle.
 */
export interface ReactionEvent {
  messageId: string;
  conversationId: string;
  category: ReactionRow["category"];
  confidence: number;
  provider: string;
  model: string;
  reason: string;
  language: string;
  createdAt: string;
}

export class ReactionRealtimeManager {
  private channel: RealtimeChannel | null = null;
  private subscribed = false;
  private supabase: import("@supabase/supabase-js").SupabaseClient | null = null;

  constructor(
    private readonly conversationId: string,
    private readonly onReaction: (event: ReactionEvent) => void
  ) {}

  private async getSupabase() {
    if (!this.supabase) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return null;
      // Lazy import — keeps the bundle small when realtime is not configured.
      const { createClient } = await import("@supabase/supabase-js");
      this.supabase = createClient(url, key);
    }
    return this.supabase;
  }

  async start(): Promise<boolean> {
    if (this.channel) return this.subscribed;
    const sb = await this.getSupabase();
    if (!sb) return false;
    this.channel = sb.channel(`reaction:${this.conversationId}`);
    this.channel.on("broadcast", { event: "reaction-updated" }, (message) => {
      const event = (message as { payload?: ReactionEvent }).payload;
      if (event?.messageId) this.onReaction(event);
    });
    await this.channel.subscribe((status) => {
      this.subscribed = status === "SUBSCRIBED";
    });
    return this.subscribed;
  }

  async stop(): Promise<void> {
    const sb = await this.getSupabase();
    if (this.channel && sb) {
      await sb.removeChannel(this.channel);
    }
    this.channel = null;
    this.subscribed = false;
  }

  isActive(): boolean {
    return this.subscribed;
  }
}

/**
 * Subscribe to reaction updates for a conversation. Returns a no-op when
 * Supabase realtime env vars are absent. The cleanup stops the subscription.
 */
export function useReactionRealtime(
  conversationId: string | null,
  onReaction: (event: ReactionEvent) => void
): boolean {
  const managerRef = useRef<ReactionRealtimeManager | null>(null);
  const callbackRef = useRef(onReaction);
  const [connected, setConnected] = useState(false);
  callbackRef.current = onReaction;

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const manager = new ReactionRealtimeManager(conversationId, (event) => callbackRef.current(event));
    managerRef.current = manager;
    void manager.start().then((ok) => {
      if (!cancelled) setConnected(ok);
    });
    return () => {
      cancelled = true;
      void manager.stop();
      managerRef.current = null;
      setConnected(false);
    };
  }, [conversationId]);

  return connected;
}
