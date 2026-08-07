import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isE2ERateLimitTestSupport, validateServerEnvironment } from "@/lib/environment";
import { resetE2ERateLimits, setE2ERateLimit } from "@/lib/e2e/rate-limit-store";
import { consumeRateLimit } from "@/lib/security/rate-limit";

describe("E2E rate-limit test support", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_BYPASS_AUTH", "true");
    vi.stubEnv("E2E_RATE_LIMIT_TEST_SUPPORT", "true");
    resetE2ERateLimits();
  });

  afterEach(() => {
    resetE2ERateLimits();
    vi.unstubAllEnvs();
  });

  it("injects deterministic decisions only for the configured action", async () => {
    setE2ERateLimit("source_preview", "denied");
    await expect(consumeRateLimit({} as never, "source_preview")).resolves.toEqual({
      allowed: false,
      retryAfter: 17,
      unavailable: false,
    });
    await expect(consumeRateLimit({} as never, "source_refresh")).resolves.toMatchObject({
      allowed: true,
    });

    setE2ERateLimit("source_refresh", "unavailable");
    await expect(consumeRateLimit({} as never, "source_refresh")).resolves.toEqual({
      allowed: false,
      retryAfter: 60,
      unavailable: true,
    });
  });

  it("cannot be enabled in production", () => {
    const environment = {
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      APP_BASE_URL: "https://jobs.example.com",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key-with-enough-length",
      PUBLIC_OPERATOR_NAME: "operator",
      PUBLIC_PRIVACY_EMAIL: "privacy@example.com",
      PUBLIC_POLICY_EFFECTIVE_DATE: "2026-08-07",
      E2E_RATE_LIMIT_TEST_SUPPORT: "true",
    };

    expect(isE2ERateLimitTestSupport(environment)).toBe(false);
    expect(() => validateServerEnvironment(environment)).toThrow(/E2E_RATE_LIMIT_TEST_SUPPORT/);
  });
});