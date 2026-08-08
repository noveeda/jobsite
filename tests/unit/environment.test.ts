import { describe, expect, it } from "vitest";
import { isE2EBypass, validateServerEnvironment } from "@/lib/environment";

const production = () => ({
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-at-least-twenty",
  APP_BASE_URL: "https://jobs.example.com",
  PUBLIC_OPERATOR_NAME: "운영자",
  PUBLIC_PRIVACY_EMAIL: "privacy@example.com",
  PUBLIC_POLICY_EFFECTIVE_DATE: "2026-08-07",
  AUTOMATIC_DISCOVERY_ENABLED: "false",
  COLLECTOR_ENABLED: "false",
  SARAMIN_CONNECTOR_ENABLED: "false",
  JOBKOREA_CONNECTOR_ENABLED: "false",
});

describe("server environment", () => {
  it("accepts complete production configuration without returning secrets", () => {
    const result = validateServerEnvironment(production());
    expect(result).toEqual(expect.objectContaining({ appBaseUrl: "https://jobs.example.com", operatorName: "운영자" }));
    expect(JSON.stringify(result)).not.toContain("service-role");
  });

  it("names invalid fields but never their values", () => {
    const env = { ...production(), APP_BASE_URL: "http://secret-host.test", SUPABASE_SERVICE_ROLE_KEY: "super-secret" };
    expect(() => validateServerEnvironment(env)).toThrow(/APP_BASE_URL|SUPABASE_SERVICE_ROLE_KEY/);
    try { validateServerEnvironment(env); } catch (error) { expect(String(error)).not.toContain("secret-host"); expect(String(error)).not.toContain("super-secret"); }
  });

  it("requires connector credentials only when enabled", () => {
    expect(() => validateServerEnvironment({ ...production(), SARAMIN_CONNECTOR_ENABLED: "true" })).toThrow(/SARAMIN_API_KEY/);
    expect(() => validateServerEnvironment({ ...production(), JOBKOREA_CONNECTOR_ENABLED: "true" })).toThrow(/JOBKOREA_API_URL/);
  });

  it("validates automatic discovery flags without returning collector secrets", () => {
    const operatorId = "00000000-0000-4000-8000-000000000001";
    const result = validateServerEnvironment({
      ...production(),
      AUTOMATIC_DISCOVERY_ENABLED: "true",
      COLLECTOR_ENABLED: "true",
      CRON_SECRET: "collector-secret-at-least-16",
      OPERATOR_USER_IDS: operatorId,
    });
    expect(result).toMatchObject({ automaticDiscoveryEnabled: true, collectorEnabled: true, operatorUserIds: [operatorId] });
    expect(JSON.stringify(result)).not.toContain("collector-secret");
  });

  it("fails closed for invalid discovery configuration", () => {
    expect(() => validateServerEnvironment({ ...production(), AUTOMATIC_DISCOVERY_ENABLED: "yes" })).toThrow(/AUTOMATIC_DISCOVERY_ENABLED/);
    expect(() => validateServerEnvironment({ ...production(), COLLECTOR_ENABLED: "true" })).toThrow(/CRON_SECRET/);
    expect(() => validateServerEnvironment({ ...production(), OPERATOR_USER_IDS: "not-a-uuid" })).toThrow(/OPERATOR_USER_IDS/);
  });

  it("never enables the E2E bypass in production", () => {
    expect(isE2EBypass({ NODE_ENV: "production", E2E_BYPASS_AUTH: "true" })).toBe(false);
    expect(() => validateServerEnvironment({ ...production(), E2E_BYPASS_AUTH: "true" })).toThrow(/E2E_BYPASS_AUTH/);
  });
});
