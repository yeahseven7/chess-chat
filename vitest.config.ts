import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    env: {
      AI_PROVIDER: "mock",
      SESSION_SECRET: "test-secret",
      LOCAL_DB_PATH: ":memory:",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
