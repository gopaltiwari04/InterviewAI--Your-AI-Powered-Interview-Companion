import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests. They need the full local stack (see docs/TESTING.md):
 *   - PostgreSQL + Redis (docker compose up -d postgres redis)
 *   - apps/ws-server, apps/code-executor (Docker) and apps/worker running
 *   - the web app with AUTH_TEST_LOGIN=enabled and AI_PROVIDER=mock
 * The web server is started automatically unless one is already running.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
