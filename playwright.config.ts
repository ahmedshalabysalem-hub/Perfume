import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_PORT, e2eDatabaseUrl } from "./tests/e2e/support/env";

/**
 * End-to-end tests run a production build (`next build` + `next start`)
 * against a disposable database that tests/e2e/global-setup.ts empties and
 * seeds on every run. See docs/TEST_PLAN.md.
 *
 * In environments with a pre-installed Chromium that does not match this
 * Playwright version, set PLAYWRIGHT_CHROMIUM_EXECUTABLE to its path.
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // The suite shares one seeded database: run serially for determinism.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.E2E_SERVER_COMMAND ?? `npm run build && npm run start -- --port ${E2E_PORT}`,
    // A route that needs no database: global setup prepares the database
    // after the server has started (Playwright starts web servers first).
    url: `${E2E_BASE_URL}/robots.txt`,
    reuseExistingServer: !isCI,
    timeout: 600_000,
    stdout: "pipe",
    env: {
      DATABASE_URL: e2eDatabaseUrl(),
      APP_URL: E2E_BASE_URL,
      // Throw-away signing secret for this server process only.
      BETTER_AUTH_SECRET: process.env.E2E_AUTH_SECRET ?? randomBytes(32).toString("base64"),
      // Every test signs in; throttling is covered by integration tests.
      AUTH_RATE_LIMIT_ENABLED: "false",
      DEFAULT_MARKET: "SA",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
