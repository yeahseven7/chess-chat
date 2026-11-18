# ChessChat — AI-reviewed messaging

![CI](https://github.com/yeahseven7/chess-chat/actions/workflows/ci.yml/badge.svg)

ChessChat is a social messaging platform where **every message is automatically analyzed by AI** and assigned exactly one of six chess-review-style reactions — displayed next to the message without any manual action from the author.

| Great `!` | Best `★` | Excellent `👍` | Mistake `?` | Miss `✕` | Blunder `??` |
|---|---|---|---|---|---|
| #3fa9f5 | #3d9a4e | #81b64c | #e8a33d | #e0704f | #d0342c |
| Interesting, impressive | Helpful, thoughtful, supportive | Good, positive, agreeable | Incorrect information | Missing the point | Profanity, insults |

Not a chess game — the symbols are exclusively a reaction system. The original message is **never** edited, censored, or modified.

---

## Architecture

```
src/
├── app/                      # Next.js App Router
│   ├── login/                # register + login (split-screen page)
│   ├── app/                  # main 3-pane chat client
│   ├── profile/[username]/   # public profile + reaction distribution
│   ├── privacy/              # data-processing notice
│   └── api/                  # 30+ route handlers (thin: auth + validate + store)
├── components/               # AppShell, MessageItem, StatsPanel, …
├── lib/
│   ├── ai/                   # provider abstraction
│   │   ├── gemini.ts         # Google Gemini (server-side only)
│   │   ├── mock.ts           # deterministic offline provider (tests only)
│   │   ├── factory.ts        # AI_PROVIDER selection
│   │   ├── pipeline.ts       # async jobs: enqueue → claim → classify → store
│   │   └── schema.ts         # Zod validation of AI output
│   └── server/               # auth (HMAC cookie + scrypt), rate limit, stores
│       ├── localStore.ts     # embedded node:sqlite driver (dev/test/e2e)
│       ├── supabaseStore.ts  # Supabase/Postgres driver (production)
│       ├── store.ts          # driver factory + typing indicators
│       └── schema.ts         # embedded schema (mirrors supabase/migrations)
├── shared/reactions.ts       # six-category source of truth
supabase/migrations/0001_init.sql  # DDL + RLS + stats cache table
supabase/seed.sql                  # synthetic fixtures for local Supabase
tests/unit                   # Vitest (46 tests, offline)
tests/integration            # live Gemini tests (opt-in via GEMINI_API_KEY)
tests/e2e                    # Playwright (13 tests, full browser)
.opencode/commands/verify.md # /verify: lint → typecheck → unit → e2e → build
.github/workflows/ci.yml     # CI: lint, typecheck, unit, e2e, build
```

### Why two storage drivers?

The app was built in an environment with no Supabase project access, so it is designed with a **driver boundary** (`Store` interface in `src/lib/server/types.ts`):

- **`LocalStore`** (embedded `node:sqlite`, zero extra dependencies) — used automatically when Supabase env vars are absent. It powers local development, the unit tests, the Playwright e2e suite and `next start` smoke testing. Fully functional: auth, friends, DMs, groups, messages, attachments, AI reactions, statistics, notifications.
- **`SupabaseStore`** — the production path (PostgreSQL via `@supabase/supabase-js`, service role key). It implements the identical `Store` contract. **It compiles and mirrors `LocalStore` semantics, but has not been executed against a live Supabase project in this environment** (no project was reachable). Treat it as close-to-verify, not verified; `supabase/migrations/0001_init.sql` plus the local driver are the reference for its behavior.

Switching drivers is purely a matter of environment variables:

```
NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY
  → Supabase/Postgres
otherwise
  → embedded SQLite (.localdata/chesschat.db, path configurable via LOCAL_DB_PATH)
```

### AI pipeline

1. `POST /api/conversations/[id]/messages` validates, saves the message and returns it **immediately** — delivery never waits for AI.
2. The route enqueues an `analysis_jobs` row (unique partial index prevents duplicates per message while pending/processing) and kicks off queue processing asynchronously.
3. Workers claim due jobs atomically, classify with the configured provider, validate the strict Zod schema (`category ∈ six values`, `confidence ∈ [0,1]`, BCP-47-ish language), upsert `analysis_reactions`, mark both job and message `completed`.
4. Failures retry with bounded exponential backoff (2s → 4s → 8s → 16s, max 4 attempts), then the job is `failed` and the message shows a subtle retry affordance — it is never lost.
5. Editing a message deletes its previous reaction and re-enqueues analysis. Deleting a message deletes the reaction, removes pending jobs, and excludes it from statistics.
6. Real-time delivery of reactions uses light polling (2.5 s), which works identically on the local driver, Vercel preview deployments and serverless; Supabase Realtime can be layered on top unchanged (the client already tolerates late-arriving reactions). Typing indicators are ephemeral in-memory state (per instance).
7. Context sent to the AI: the message plus at most 6 recent messages — never more. Full conversation history is never transmitted. Reaction explanations (`reason`) are visible only to conversation participants on hover; private message contents are not written to application logs.

## Getting started

Requirements: **Node.js ≥ 22.11** (uses `node:sqlite`) and npm.

```bash
npm install
cp .env.example .env.local      # then edit values
npm run dev                     # http://localhost:3000
# optional fixtures (users aisha/timur/dana, password: password123):
npm run seed                    # (server must be running, ENABLE_DEV_SEED=true)
```

### Environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `SESSION_SECRET` | server | HMAC key for session cookies (required) |
| `AI_PROVIDER` | server | `gemini` (default, real API) or `mock` (deterministic, tests) |
| `GEMINI_API_KEY` | server | Google Gemini key — **never** expose to the client |
| `GEMINI_MODEL` | server | Model name, default `gemini-2.0-flash` |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL (production) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Supabase service role — **server only** |
| `LOCAL_DB_PATH` | server | SQLite file for the local driver |
| `ENABLE_DEV_SEED` | server | Enables `POST /api/dev/seed` — **never in production** |
| `SESSION_COOKIE_SECURE` | server | `false` only for plain-HTTP local testing |
| `CRON_SECRET` | server | Optional bearer for `POST /api/analysis/process` cron drains |

## Testing

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run test          # Vitest unit tests (offline, deterministic)
npm run test:e2e      # Playwright browser tests (Chromium; resets fixtures per test)
npm run test:integration  # live Gemini tests (skipped without GEMINI_API_KEY)
npm run build         # production build
npm run verify        # all of the above, in order
```

- Unit tests mock nothing of the database (real in-memory `node:sqlite`) and use the deterministic mock provider for AI.
- Playwright tests launch a real production server, reset fixtures via `POST /api/dev/seed`, and cover register/login, seeded reaction badges, sending → automatic analysis, edit → reanalysis, delete, statistics, friends, groups, notifications, and the mobile layout.
- CI (GitHub Actions) runs lint → typecheck → unit → build → Playwright on PRs and pushes to `main`. Live Gemini checks are opt-in via a repository variable `GEMINI_INTEGRATION_ENABLED=true` plus the `GEMINI_API_KEY` secret; secret values are never printed.

## Deployment (Vercel + GitHub)

1. Push this repository to GitHub (see note below) — `.github/workflows/ci.yml` gates PRs and `main`.
2. In Vercel: **Add New → Project → Import** this repository. Framework auto-detects Next.js.
3. Set environment variables for **Production** and **Preview** separately:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY` (Vercel Preview and Production may use different keys/models)
   - `SESSION_SECRET` (generate per environment), `AI_PROVIDER=gemini`
   - Do **not** set `ENABLE_DEV_SEED` or `SESSION_COOKIE_SECURE` in Vercel.
4. Provision Supabase (`supabase init && supabase db push` applies `supabase/migrations/0001_init.sql`; `supabase/seed.sql` adds synthetic fixtures locally only).
5. Preview deployments are created automatically per PR; production deploys only from `main` after checks pass.
6. Optional: run `POST /api/analysis/process` on a schedule (e.g. Vercel Cron) with header `x-cron-secret: $CRON_SECRET` to drain any stranded analysis jobs serverlessly.

## Security & privacy

- Passwords hashed with scrypt (local driver); Supabase Auth manages credentials in production.
- Server-side authorization on every route; RLS policies as the second line of defense.
- Rate limits on registration, login, sending, requeueing and analysis endpoints.
- Attachments: MIME whitelist, 8 MB cap, random stored names, authenticated serving with membership checks.
- `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only; no private contents in logs.
- Reactions are playful annotations, not moderation. Use the built-in report and block tools for safety concerns.
- See `/privacy` for the data-processing notice. AI reactions are never used to moderate, filter, or censor messages.

## Known limitations

- **Supabase driver unverified locally** — written and typechecked, not executed against a live project (none reachable). Local driver is the verified path.
- Real-time is poll-based (2.5 s); Supabase Realtime can be added for push updates without changing the data model.
- Typing indicators are per-instance ephemeral state.
- Statistics computed on read; the `reaction_statistics` table is an optional trigger-maintained cache for reporting only.
- Live Gemini classification quality can only be validated with `GEMINI_API_KEY` (`npm run test:integration`).
