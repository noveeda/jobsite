import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSaraminCatalogAdapter,
  parseSaraminCatalogPage,
  type SaraminCatalogRecord,
} from "@/lib/sources/saramin";
import { ProviderAdapterError, type FetchPageInput } from "@/lib/sources/provider-adapter";

const originalFlag = process.env.SARAMIN_CONNECTOR_ENABLED;
const originalKey = process.env.SARAMIN_API_KEY;
const input: FetchPageInput = {
  cursor: null,
  runKind: "incremental",
  changedSince: "2026-08-08T00:00:00.000Z",
  scope: { roleCodes: ["84"], locationCodes: ["101000"] },
  runId: "fe13c4ca-8b03-4b15-87e8-e646729e42aa",
  signal: new AbortController().signal,
};
const record: SaraminCatalogRecord = {
  id: "123",
  url: "http://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123&utm_source=job-search-api",
  active: 1,
  company: { detail: { name: "예시 회사", href: "http://www.saramin.co.kr/zf_user/company-info/view?csn=1" } },
  position: {
    title: "백엔드 개발자",
    location: { code: "101000", name: "서울" },
    "job-type": { code: "1", name: "정규직" },
    "job-mid-code": { code: "84", name: "IT개발" },
    "job-code": { code: "84", name: "백엔드" },
    "experience-level": { code: "2", min: 2, max: 5, name: "경력 2~5년" },
    "required-education-level": { code: "4", name: "대학교 졸업" },
    industry: { code: "301", name: "솔루션" },
  },
  salary: { code: "99", name: "면접 후 결정" },
  "posting-timestamp": 1_786_147_200,
  "modification-timestamp": 1_786_147_260,
  "opening-timestamp": 1_786_147_200,
  "expiration-timestamp": 1_788_825_600,
  "close-type": { code: "1", name: "접수 마감일" },
};

function restore(name: "SARAMIN_CONNECTOR_ENABLED" | "SARAMIN_API_KEY", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function pagePayload(overrides: Record<string, unknown> = {}) {
  return { jobs: { count: 1, start: 0, total: 1, job: [record], ...overrides } };
}

afterEach(() => {
  restore("SARAMIN_CONNECTOR_ENABLED", originalFlag);
  restore("SARAMIN_API_KEY", originalKey);
});

describe("Saramin catalog adapter", () => {
  it("stays pending and performs no request even when credentials are present before approval", async () => {
    process.env.SARAMIN_CONNECTOR_ENABLED = "true";
    process.env.SARAMIN_API_KEY = "fixture-secret-key";
    const fetcher = vi.fn();
    const adapter = createSaraminCatalogAdapter(fetcher as unknown as typeof fetch);

    await expect(adapter.fetchPage(input)).rejects.toMatchObject({ code: "CONNECTOR_DISABLED" });
    expect(adapter.configuration).toMatchObject({ enabled: false, compliance: { approvalStatus: "pending" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("marks only the final reconciliation page as a complete snapshot", () => {
    expect(parseSaraminCatalogPage(pagePayload(), { cursor: null, runKind: "incremental" }).snapshotComplete).toBe(false);
    expect(parseSaraminCatalogPage(pagePayload(), { cursor: null, runKind: "reconciliation" }).snapshotComplete).toBe(true);
    expect(parseSaraminCatalogPage(pagePayload({ total: 221 }), {
      cursor: null,
      runKind: "reconciliation",
    })).toMatchObject({ nextCursor: "saramin-page:1", snapshotComplete: false, total: 221 });
  });

  it("rejects top-level provider errors without retaining their message", () => {
    let caught: unknown;
    try {
      parseSaraminCatalogPage({ code: 4, message: "quota fixture-secret-key" }, { cursor: null, runKind: "incremental" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderAdapterError);
    expect(caught).toMatchObject({
      code: "SOURCE_RATE_LIMITED",
      message: "SOURCE_RATE_LIMITED",
      retry: { strategy: "after", retryAfterMs: 60_000 },
    });
    expect(JSON.stringify(caught)).not.toContain("fixture-secret-key");
  });

  it("requires jobs.start and jobs.count to match the requested page", () => {
    expect(() => parseSaraminCatalogPage(pagePayload({ start: 1 }), {
      cursor: null,
      runKind: "incremental",
    })).toThrowError(expect.objectContaining({ code: "SOURCE_RESPONSE_INVALID" }));
    expect(() => parseSaraminCatalogPage(pagePayload({ count: 2 }), {
      cursor: null,
      runKind: "incremental",
    })).toThrowError(expect.objectContaining({ code: "SOURCE_RESPONSE_INVALID" }));
  });

  it("keeps close-type as a source fact and deadlineKind as normalized provenance", () => {
    const adapter = createSaraminCatalogAdapter(vi.fn() as unknown as typeof fetch);
    const posting = adapter.normalize(record, "2026-08-08T00:00:00.000Z");

    expect(posting).toMatchObject({
      sourceStatus: "active",
      sourceValues: { closeType: { code: "1", label: "접수 마감일" } },
      normalized: { deadlineKind: "fixed" },
      fieldProvenance: { deadlineKind: { origin: "normalized" } },
    });
    expect(posting.sourceValues).not.toHaveProperty("deadlineKind");
    expect(JSON.stringify(posting)).not.toContain("fixture-secret-key");
  });

  it("accepts only the documented active 0/1 values", () => {
    const adapter = createSaraminCatalogAdapter(vi.fn() as unknown as typeof fetch);
    expect(adapter.normalize({ ...record, active: "0" }, input.changedSince!).sourceStatus).toBe("closed");
    expect(adapter.normalize({ ...record, active: "1" }, input.changedSince!).sourceStatus).toBe("active");
    for (const active of [undefined, 2, true]) {
      expect(() => adapter.normalize({ ...record, active }, input.changedSince!)).toThrowError(
        expect.objectContaining({ code: "SOURCE_RESPONSE_INVALID" }),
      );
    }
  });
});