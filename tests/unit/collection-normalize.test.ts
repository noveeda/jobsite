import { describe, expect, it } from "vitest";

import { normalizeSourceUrl, prepareSourcePosting } from "@/lib/collection/normalize";
import type { ProviderConfiguration, SourcePostingInput } from "@/lib/sources/provider-adapter";

const configuration: ProviderConfiguration = {
  code: "fixture-core",
  enabled: true,
  capabilities: { incremental: true, completeSnapshot: true, explicitClose: true, cursor: "page-number" },
  compliance: {
    approvalStatus: "approved",
    termsUrl: "https://example.com/terms",
    attribution: { text: "Fixture", href: "https://example.com" },
    callLimits: { daily: 500, scheduled: 400, reserve: 100, pageSize: 100 },
    retentionPolicy: { allowedSourceFields: ["department", "team", "metadata"], retentionDays: 30, purgeOnDisable: true },
    monetizationRestrictions: [],
  },
};

const posting: SourcePostingInput = {
  providerCode: "fixture-core",
  externalId: "job-1",
  originalUrl: "https://example.com/jobs/1?utm_source=mail&b=2&a=1#apply",
  sourceStatus: "active",
  fetchedAt: "2026-08-08T00:00:00.000Z",
  sourceValues: { department: "platform", team: "search", metadata: { zeta: 2, alpha: 1 } },
  normalized: { title: "Backend Engineer", companyName: "Fixture Inc." },
  fieldProvenance: {
    title: { sourcePosting: { providerCode: "fixture-core", externalId: "job-1" }, origin: "source", observedAt: "2026-08-08T00:00:00.000Z" },
    companyName: { sourcePosting: { providerCode: "fixture-core", externalId: "job-1" }, origin: "source", observedAt: "2026-08-08T00:00:00.000Z" },
  },
};

describe("source posting normalization", () => {
  it("keeps the original URL and creates a stable tracking-free URL", () => {
    const result = prepareSourcePosting(configuration, posting);

    expect(result.originalUrl).toBe(posting.originalUrl);
    expect(result.normalizedUrl).toBe("https://example.com/jobs/1?a=1&b=2");
    expect(result.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates the same fingerprint for differently ordered multi-key curated facts", () => {
    const reordered: SourcePostingInput = {
      ...posting,
      sourceValues: { metadata: { alpha: 1, zeta: 2 }, team: "search", department: "platform" },
      normalized: { companyName: "Fixture Inc.", title: "Backend Engineer" },
    };
    expect(prepareSourcePosting(configuration, reordered).contentFingerprint)
      .toBe(prepareSourcePosting(configuration, posting).contentFingerprint);
  });

  it("does not expose raw provider payload fields", () => {
    const result = prepareSourcePosting(configuration, posting as SourcePostingInput & { rawPayload: unknown });
    expect(result).not.toHaveProperty("rawPayload");
    expect(JSON.stringify(result)).not.toContain("rawPayload");
  });

  it("rejects fields outside the approved retention allowlist", () => {
    expect(() => prepareSourcePosting(configuration, {
      ...posting,
      sourceValues: { department: "platform", rawDescription: "not approved" },
    })).toThrow();
  });

  it("normalizes query order and fragments independently", () => {
    expect(normalizeSourceUrl("https://example.com/jobs/1?z=3&ref=feed&a=1#top"))
      .toBe("https://example.com/jobs/1?a=1&z=3");
  });
});
