# /verify — Full verification cycle for ChessChat

When invoked, perform a complete verification cycle on the repository. Do **not** stop until every step passes or a genuine external blocker remains.

## Hard rules

Never:
- Delete, skip, or weaken tests to make them pass.
- Disable TypeScript checking or ESLint rules to hide errors.
- Replace real functionality with stubs or fake data to get a green build.
- Claim a command passed without actually running it and reading its output.
- Push to `main` directly, force-push, or commit secrets.

## Steps

1. **Inspect** the repository and the pending changes.
   - `git status`, `git diff --stat`, `git log --oneline -5` (if in a git repo).
   - Identify what changed and which areas are affected.

2. **Install dependencies** (only if `node_modules` is missing or lockfile changed):
   - `npm ci` (use the lockfile; do not regenerate it gratuitously).

3. **Lint**: `npm run lint`

4. **Typecheck**: `npm run typecheck`

5. **Unit tests**: `npm run test` (Vitest). Inspect every failure; fix the *cause*, not the assertion.

6. **Browser tests**: `npm run test:e2e` (Playwright, Chromium).
   - The e2e suite resets the local SQLite database per test via `POST /api/dev/seed` (requires `ENABLE_DEV_SEED=true` — already configured in `playwright.config.ts`).
   - If a test fails, inspect `test-results/**/error-context.md` and the `-failed` screenshot before changing anything.

7. **Production build**: `npm run build`

8. **On any failure**:
   - Read the full error, find the root cause in the source.
   - Make the **smallest** fix consistent with the existing architecture.
   - Re-run the failed step, then the remaining steps in order.
   - If a fix introduces a new failure, investigate that too. Repeat until green or a genuine blocker (e.g. missing credentials for an external service) prevents verification — then document precisely what could not be verified and why.

9. **Report**: summarize implemented changes, verification results (lint/typecheck/unit/e2e/build — with real outputs), and any remaining issues.

## Notes

- The app uses an embedded local SQLite driver when Supabase env vars are absent; CI and local checks use it with `AI_PROVIDER=mock`. Live Gemini checks run only via `npm run test:integration` with `GEMINI_API_KEY` set, and are not part of the required gate.
- `npm run verify` executes lint → typecheck → unit tests → e2e tests → build in one command.
