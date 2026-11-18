import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `next start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      AI_PROVIDER: "mock",
      ENABLE_DEV_SEED: "true",
      SESSION_SECRET: "e2e-test-secret",
      SESSION_COOKIE_SECURE: "false",
      LOCAL_DB_PATH: ".localdata/e2e.db",
      NODE_ENV: "production",
    },
  },
});
