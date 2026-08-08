import { describe, expect, it, vi } from "vitest";

import { resolveSaraminActivation, type RestrictedProviderRecord } from "@/lib/sources/activation";
import { previewSource } from "@/lib/sources/connector";

const approved: RestrictedProviderRecord = {
  code: "saramin",
  enabled: true,
  activation_required: true,
  access_mode: "approved_api",
  approval_status: "approved",
  approval_reference: "SAR-APPROVAL-2026-08",
  approval_expires_at: "2026-12-31T00:00:00.000Z",
  staging_smoke_reference: "staging-smoke-2026-08-09",
  enabled_at: "2026-08-09T00:00:00.000Z",
  enabled_by: "00000000-0000-4000-8000-000000000001",
  attribution: { text: "Powered by 취업 사람인", href: "https://www.saramin.co.kr" },
  retention_policy: { allowedSourceFields: ["title"], retentionDays: 1 },
};

function reader(record: RestrictedProviderRecord | null) {
  return { readProvider: async () => record };
}

describe("Saramin source activation", () => {
  it("does not let an environment flag and credential bypass a pending approval", async () => {
    const result = await resolveSaraminActivation(
      reader({ ...approved, approval_status: "pending" }),
      { SARAMIN_CONNECTOR_ENABLED: "true", SARAMIN_API_KEY: "fixture-key" },
    );
    expect(result).toEqual({ enabled: false, provider: "saramin", reason: "SOURCE_APPROVAL_PENDING" });
  });

  it.each([
    ["blocked", "SOURCE_APPROVAL_BLOCKED"],
    ["withdrawn", "SOURCE_APPROVAL_WITHDRAWN"],
  ] as const)("fails closed for %s approval records", async (approval_status, reason) => {
    await expect(resolveSaraminActivation(reader({ ...approved, approval_status }), { SARAMIN_API_KEY: "fixture-key" }))
      .resolves.toEqual({ enabled: false, provider: "saramin", reason });
  });

  it("fails closed for an expired approval or a concurrent disable", async () => {
    await expect(resolveSaraminActivation(reader({ ...approved, approval_expires_at: "2026-08-08T00:00:00.000Z" }), { SARAMIN_API_KEY: "fixture-key" }))
      .resolves.toEqual({ enabled: false, provider: "saramin", reason: "SOURCE_APPROVAL_STALE" });
    await expect(resolveSaraminActivation(reader({ ...approved, enabled: false }), { SARAMIN_API_KEY: "fixture-key" }))
      .resolves.toEqual({ enabled: false, provider: "saramin", reason: "SOURCE_ACTIVATION_INCOMPLETE" });
  });

  it("requires the current restricted record and a server credential without serializing either", async () => {
    const result = await resolveSaraminActivation(reader(approved), { SARAMIN_API_KEY: "fixture-key" });
    expect(result).toEqual({ enabled: true, provider: "saramin" });
    expect(JSON.stringify(result)).not.toContain("fixture-key");
    await expect(resolveSaraminActivation(reader(approved), {})).resolves.toEqual({
      enabled: false, provider: "saramin", reason: "SOURCE_CREDENTIAL_MISSING",
    });
  });

  it("fails closed when the restricted record cannot be read", async () => {
    await expect(resolveSaraminActivation(undefined, {})).resolves.toEqual({
      enabled: false, provider: "saramin", reason: "CONNECTOR_DISABLED",
    });
  });

  it("stops preview before its provider call when the current record is disabled", async () => {
    const providerCall = vi.fn();
    const preview = await previewSource("https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123", {
      resolveSaraminActivation: async () => ({ enabled: false, provider: "saramin", reason: "SOURCE_APPROVAL_WITHDRAWN" }),
      providerCall,
    });
    expect(preview).toMatchObject({ result: null, warnings: ["SOURCE_APPROVAL_WITHDRAWN"] });
    expect(providerCall).not.toHaveBeenCalled();
  });
});
