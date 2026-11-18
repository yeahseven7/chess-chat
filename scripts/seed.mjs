#!/usr/bin/env node
/**
 * Development seed helper. POSTs to the running dev server's seed endpoint,
 * which resets the local database and loads deterministic fixtures.
 *
 * Usage:
 *   npm run dev            # terminal 1
 *   npm run seed           # terminal 2
 *
 * Requires ENABLE_DEV_SEED=true on the server (default in .env.example).
 */
const base = process.env.APP_URL ?? "http://localhost:3000";

try {
  const res = await fetch(`${base}/api/dev/seed`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Seed failed (${res.status}): ${body.error ?? "unknown error"}`);
    process.exit(1);
  }
  console.log("Seeded development database:");
  console.log(`  users:    ${body.users?.join(", ")} (password: ${body.password})`);
  console.log(`  direct:   ${body.directConversationId}`);
  console.log(`  group:    ${body.groupConversationId}`);
} catch (error) {
  console.error(`Cannot reach ${base} — is the dev server running?`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
