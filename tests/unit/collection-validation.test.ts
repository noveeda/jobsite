import { describe, expect, it } from "vitest";

import type { ProviderConfiguration } from "@/lib/sources/provider-adapter";
import {
  collectionRequestSchema,
  createNormalizedPostingSchema,
  providerConfigurationSchema,
  providerPageSchema,
} from "@/lib/validation/collection";

const observedAt = "2026-08-08T00:00:00.000Z";
const approvedProvider: ProviderConfiguration = {
  code: "fixture-page",
  capabilities: { incremental: true, completeSnapshot: true, explicitClose: false, cursor: "page-number" },
  compliance: {
    approvalStatus: "approved",
    termsUrl: "https://example.com/terms",
    attribution: { text: "Example", href: "https://example.com" },
    callLimits: { daily: 500, scheduled: 400, reserve: 100, pageSize: 110 },
    retentionPolicy: { allowedSourceFields: ["title", "company", "metadata", "applyUrl"], retentionDays: 30, purgeOnDisable: true },
    monetizationRestrictions: [],
  },
  enabled: true,
};

const saraminProvider: ProviderConfiguration = {
  ...approvedProvider,
  code: "saramin",
  capabilities: { ...approvedProvider.capabilities, cursor: "opaque-token" },
};

function provenance(providerCode = approvedProvider.code, externalId = "job-1") {
  return {
    sourcePosting: { providerCode, externalId },
    origin: "source" as const,
    observedAt,
  };
}

function validPosting() {
  return {
    providerCode: approvedProvider.code,
    externalId: "job-1",
    originalUrl: "https://example.com/jobs/1",
    sourceStatus: "active" as const,
    fetchedAt: observedAt,
    sourceValues: { title: "개발자", company: "예시 회사", metadata: { labels: ["backend", null] } },
    normalized: { title: "개발자", companyName: "예시 회사" },
    fieldProvenance: { title: provenance(), companyName: provenance() },
  };
}

describe("provider configuration", () => {
  it("accepts an approved provider and rejects enabled pending approval", () => {
    expect(providerConfigurationSchema.safeParse(approvedProvider).success).toBe(true);
    expect(providerConfigurationSchema.safeParse({
      ...approvedProvider,
      compliance: { ...approvedProvider.compliance, approvalStatus: "pending" },
    }).success).toBe(false);
  });

  it("rejects scheduled plus reserve quota above the daily limit", () => {
    expect(providerConfigurationSchema.safeParse({
      ...approvedProvider,
      compliance: {
        ...approvedProvider.compliance,
        callLimits: { daily: 500, scheduled: 401, reserve: 100, pageSize: 110 },
      },
    }).success).toBe(false);
  });

  it("enforces Saramin's exact contractual limits", () => {
    expect(providerConfigurationSchema.safeParse(saraminProvider).success).toBe(true);
    for (const [name, value] of Object.entries({ daily: 501, scheduled: 399, reserve: 99, pageSize: 111 })) {
      expect(providerConfigurationSchema.safeParse({
        ...saraminProvider,
        compliance: {
          ...saraminProvider.compliance,
          callLimits: { ...saraminProvider.compliance.callLimits, [name]: value },
        },
      }).success, name).toBe(false);
    }
  });

  it("requires HTTPS URLs without URL credentials", () => {
    for (const termsUrl of ["http://example.com/terms", "https://user:pass@example.com/terms"]) {
      expect(providerConfigurationSchema.safeParse({
        ...approvedProvider,
        compliance: { ...approvedProvider.compliance, termsUrl },
      }).success).toBe(false);
    }
  });
});

describe("collection request and page boundaries", () => {
  it("preserves an opaque cursor and accepts UTC timestamps", () => {
    const cursor = "opaque:after/red?provider-owned=true";
    const result = collectionRequestSchema.parse({
      cursor,
      changedSince: observedAt,
      scope: { roleCodes: ["backend"], locationCodes: ["seoul"] },
      runId: "fe13c4ca-8b03-4b15-87e8-e646729e42aa",
      signal: new AbortController().signal,
    });
    expect(result.cursor).toBe(cursor);
  });

  it("rejects non-UTC timestamps and oversized cursors", () => {
    const request = {
      cursor: null,
      changedSince: observedAt,
      scope: { roleCodes: [], locationCodes: [] },
      runId: "fe13c4ca-8b03-4b15-87e8-e646729e42aa",
      signal: new AbortController().signal,
    };
    expect(collectionRequestSchema.safeParse({ ...request, changedSince: "2026-08-08T09:00:00+09:00" }).success).toBe(false);
    expect(collectionRequestSchema.safeParse({ ...request, cursor: "x".repeat(2049) }).success).toBe(false);
  });

  it("requires positive quota cost and UTC fetchedAt", () => {
    const page = { items: [], nextCursor: null, total: 0, snapshotComplete: true, quotaCost: 1, fetchedAt: observedAt };
    expect(providerPageSchema.safeParse(page).success).toBe(true);
    expect(providerPageSchema.safeParse({ ...page, quotaCost: 0 }).success).toBe(false);
    expect(providerPageSchema.safeParse({ ...page, fetchedAt: "2026-08-08T09:00:00+09:00" }).success).toBe(false);
  });
});

describe("configuration-aware normalized postings", () => {
  const schema = createNormalizedPostingSchema(approvedProvider);

  it("accepts allowed JSON source values with complete matching provenance", () => {
    expect(schema.safeParse(validPosting()).success).toBe(true);
  });

  it("rejects provider fields outside the retention allowlist", () => {
    expect(schema.safeParse({
      ...validPosting(),
      sourceValues: { ...validPosting().sourceValues, rawPayload: { body: "not allowed" } },
    }).success).toBe(false);
  });

  it("rejects a sensitive top-level field even when the retention allowlist includes it", () => {
    const unsafeConfiguration = {
      ...approvedProvider,
      compliance: {
        ...approvedProvider.compliance,
        retentionPolicy: {
          ...approvedProvider.compliance.retentionPolicy,
          allowedSourceFields: [...approvedProvider.compliance.retentionPolicy.allowedSourceFields, "accessKey"],
        },
      },
    };
    expect(createNormalizedPostingSchema(unsafeConfiguration).safeParse({
      ...validPosting(),
      sourceValues: { ...validPosting().sourceValues, accessKey: "must-not-persist" },
    }).success).toBe(false);
  });

  it("rejects non-JSON source values", () => {
    expect(schema.safeParse({
      ...validPosting(),
      sourceValues: { ...validPosting().sourceValues, metadata: { missing: undefined } },
    }).success).toBe(false);
  });

  it.each(["clientSecret", "oauth_token", "refreshToken"])("rejects normalized sensitive key variant %s", (key) => {
    expect(schema.safeParse({
      ...validPosting(),
      sourceValues: { ...validPosting().sourceValues, metadata: { request: { [key]: "must-not-persist" } } },
    }).success).toBe(false);
  });

  it("rejects URL userinfo and sensitive query parameters at every nesting level", () => {
    for (const applyUrl of [
      "https://user:pass@example.com/jobs/1",
      "https://example.com/jobs/1?client_secret=must-not-persist",
    ]) {
      expect(schema.safeParse({ ...validPosting(), sourceValues: { ...validPosting().sourceValues, applyUrl } }).success).toBe(false);
    }
    expect(schema.safeParse({
      ...validPosting(),
      originalUrl: "https://example.com/jobs/1?access-key=must-not-persist",
    }).success).toBe(false);
  });

  it("requires provenance for every populated normalized field", () => {
    expect(schema.safeParse({
      ...validPosting(),
      fieldProvenance: { title: provenance() },
    }).success).toBe(false);
  });

  it("requires all provenance to reference the top-level source posting", () => {
    expect(schema.safeParse({
      ...validPosting(),
      fieldProvenance: { title: provenance("other-provider"), companyName: provenance() },
    }).success).toBe(false);
    expect(schema.safeParse({
      ...validPosting(),
      fieldProvenance: { title: provenance(approvedProvider.code, "other-job"), companyName: provenance() },
    }).success).toBe(false);
  });

  it("rejects a posting from a provider other than its configuration", () => {
    expect(schema.safeParse({ ...validPosting(), providerCode: "other-provider" }).success).toBe(false);
  });
});