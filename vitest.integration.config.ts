import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Live Gemini integration tests — skipped unless GEMINI_API_KEY is set.
 * Run with: npm run test:integration
 * These call the real API with synthetic, non-sensitive messages only.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    env: {
      AI_PROVIDER: "gemini",
      SESSION_SECRET: "integration-test-secret",
      LOCAL_DB_PATH: ":memory:",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
