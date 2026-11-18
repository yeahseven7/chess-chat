/**
 * Store factory. Production (when Supabase env vars are configured) uses the
 * Supabase driver; otherwise an embedded SQLite driver is used (dev/test/e2e).
 */
import path from "node:path";
import { LocalStore } from "./localStore";
import type { Store } from "./types";

let singleton: Store | null = null;

export function isSupabaseEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getStore(): Store {
  if (singleton) return singleton;
  if (isSupabaseEnabled()) {
    // Lazy require so the local path never pays the cost.
        const { SupabaseStore } = require("./supabaseStore") as typeof import("./supabaseStore");
    singleton = new SupabaseStore(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    return singleton;
  }
  const dbPath = process.env.LOCAL_DB_PATH ?? path.join(process.cwd(), ".localdata", "chesschat.db");
  // Serverless filesystems can be read-only: fall back to in-memory rather than crash.
  try {
    singleton = new LocalStore(dbPath);
  } catch (error) {
    console.error(
      `[store] Could not open local database at ${dbPath} (${
        error instanceof Error ? error.message : String(error)
      }). Falling back to in-memory storage.`
    );
    singleton = new LocalStore(":memory:");
  }
  return singleton;
}

/** Test helper: build an isolated in-memory store. */
export function createTestStore(): Store {
  return new LocalStore(":memory:");
}

// In-memory typing indicators (ephemeral; single instance).
const typingMap = new Map<string, Map<string, number>>();

export function setTyping(conversationId: string, userId: string): void {
  const conv = typingMap.get(conversationId) ?? new Map<string, number>();
  conv.set(userId, Date.now());
  typingMap.set(conversationId, conv);
}

export function getTyping(conversationId: string, excludeUserId: string): string[] {
  const conv = typingMap.get(conversationId);
  if (!conv) return [];
  const cutoff = Date.now() - 4000;
  const result: string[] = [];
  for (const [uid, ts] of conv) {
    if (ts < cutoff) conv.delete(uid);
    else if (uid !== excludeUserId) result.push(uid);
  }
  return result;
}
