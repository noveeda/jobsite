import { afterEach, describe, expect, it, vi } from "vitest";

import {
  pageCursorFixtureAdapter,
  tokenCursorFixtureAdapter,
} from "@/lib/sources/fixtures/adapters";
import { ProviderAdapterError, type FetchPageInput } from "@/lib/sources/provider-adapter";

const baseRequest: Omit<FetchPageInput, "cursor"> = {
  runKind: "incremental",
  changedSince: null,
  scope: { roleCodes: [], locationCodes: [] },
  runId: "00000000-0000-4000-8000-000000000001",
  signal: new AbortController().signal,
};

afterEach(() => vi.unstubAllGlobals());

describe("fixture provider adapter contract", () => {
  it("preserves page-number and opaque cursors without external requests", async () => {
    const fetcher = vi.fn(() => { throw new Error("fixture adapters must not use fetch"); });
    vi.stubGlobal("fetch", fetcher);

    const numbered = await pageCursorFixtureAdapter.fetchPage({ ...baseRequest, cursor: "page:1" });
    const opaque = await tokenCursorFixtureAdapter.fetchPage({ ...baseRequest, cursor: "after:red" });

    expect(numbered.items[0]?.externalId).toBe("page-021");
    expect(numbered.nextCursor).toBe("page:2");
    expect(opaque.items[0]?.externalId).toBe("token-018");
    expect(opaque.nextCursor).toBe("after:blue");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["page-number", pageCursorFixtureAdapter, 20, "page:1"],
    ["opaque-token", tokenCursorFixtureAdapter, 17, "after:red"],
  ] as const)("reports quota cost and a partial first %s page", async (_style, adapter, size, nextCursor) => {
    const page = await adapter.fetchPage({ ...baseRequest, cursor: null });

    expect(page.items).toHaveLength(size);
    expect(page.nextCursor).toBe(nextCursor);
    expect(page.snapshotComplete).toBe(false);
    expect(page.quotaCost).toBe(1);
    expect(page.total).toBe(60);
    expect(page.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
  });

  it.each([
    [pageCursorFixtureAdapter, "page:2", 20],
    [tokenCursorFixtureAdapter, "after:gold", 9],
  ] as const)("does not mark an exhausted incremental page as a complete snapshot", async (adapter, cursor, size) => {
    const page = await adapter.fetchPage({ ...baseRequest, cursor });

    expect(page.items).toHaveLength(size);
    expect(page.nextCursor).toBeNull();
    expect(page.snapshotComplete).toBe(false);
    expect(page.quotaCost).toBe(1);
  });

  it.each([
    [pageCursorFixtureAdapter, "page:2"],
    [tokenCursorFixtureAdapter, "after:gold"],
  ] as const)("marks only an exhausted reconciliation page as a complete snapshot", async (adapter, cursor) => {
    const page = await adapter.fetchPage({ ...baseRequest, runKind: "reconciliation", cursor });

    expect(page.nextCursor).toBeNull();
    expect(page.snapshotComplete).toBe(true);
  });

  it("normalizes required facts and traceable provenance", async () => {
    const fetchedAt = "2026-08-08T00:00:00.000Z";
    const page = await pageCursorFixtureAdapter.fetchPage({ ...baseRequest, cursor: null });
    const posting = pageCursorFixtureAdapter.normalize(page.items[0]!, fetchedAt);

    expect(posting).toMatchObject({
      providerCode: "fixture-page",
      externalId: "page-001",
      originalUrl: "https://fixture-page.example.invalid/jobs/1",
      sourceStatus: "active",
      fetchedAt,
      normalized: {
        title: "플랫폼 개발자",
        companyName: "fixture-page 중복예시 주식회사",
        locations: [{ label: "서울" }],
      },
    });
    expect(posting.sourceValues).not.toHaveProperty("rawPayload");
    expect(posting.fieldProvenance.title).toEqual({
      sourcePosting: { providerCode: "fixture-page", externalId: "page-001" },
      origin: "source",
      observedAt: fetchedAt,
    });
  });

  it.each([
    pageCursorFixtureAdapter,
    tokenCursorFixtureAdapter,
  ])("maps invalid cursors to the stable request error", async (adapter) => {
    const error = await adapter.fetchPage({ ...baseRequest, cursor: "secret-invalid-cursor" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderAdapterError);
    expect(error).toMatchObject({
      code: "SOURCE_REQUEST_INVALID",
      message: "SOURCE_REQUEST_INVALID",
      retry: { strategy: "never" },
    });
    expect(JSON.stringify(error)).not.toContain("secret-invalid-cursor");
  });
});
