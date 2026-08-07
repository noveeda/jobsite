import { defineConfig, devices } from "@playwright/test";

const port = 3011;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "operational-safety.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "test-key",
      E2E_BYPASS_AUTH: "true",
      E2E_RATE_LIMIT_TEST_SUPPORT: "true",
      APP_BASE_URL: baseURL,
      PUBLIC_OPERATOR_NAME: "테스트 운영자",
      PUBLIC_PRIVACY_EMAIL: "privacy@example.com",
      PUBLIC_POLICY_EFFECTIVE_DATE: "2026-08-07",
    },
  },
});