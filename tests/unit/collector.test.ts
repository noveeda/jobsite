import { describe, expect, it, vi } from "vitest";

import { collectCatalog } from "@/lib/collection/collect";
import { ProviderAdapterError } from "@/lib/sources/provider-adapter";
import { pageCursorFixtureAdapter } from "@/lib/sources/fixtures/adapters";

const now = new Date("2026-08-08T06:00:00.000Z");
const success = {
  fetched: 4,
  upserted: 3,
  closed: 1,
  fetchedAt: "2026-08-08T05:59:30.000Z",
  snapshotComplete: true,
};

function provider(code: string, lastSuccessAt: string | null = null) {
  return { code, enabled: true, lastSuccessAt, refreshIntervalMinutes: 360 };
}

function dependencies(providers = [provider("alpha")]) {
  return {
    listProviders: vi.fn().mockResolvedValue(providers),
    claimRun: vi.fn().mockImplementation(async ({ providerCode }: { providerCode: string }) => ({ id: `run-${providerCode}` })),
    runProvider: vi.fn().mockResolvedValue(success),
    finishRun: vi.fn().mockResolvedValue(undefined),
  };
}

describe("catalog collector", () => {
  it("uses a database lease as the idempotency boundary", async () => {
    const deps = dependencies();
    deps.claimRun.mockResolvedValueOnce({ id: "run-alpha" }).mockResolvedValueOnce(null);

    await collectCatalog({ reason: "scheduled", now, maxAttempts: 2 }, deps);
    const duplicate = await collectCatalog({ reason: "scheduled", now, maxAttempts: 2 }, deps);

    expect(deps.claimRun).toHaveBeenCalledTimes(2);
    expect(deps.runProvider).toHaveBeenCalledTimes(1);
    expect(deps.finishRun).toHaveBeenCalledTimes(1);
    expect(duplicate.runs).toEqual([]);
  });

  it("retries retryable provider failures only up to maxAttempts", async () => {
    const deps = dependencies();
    deps.runProvider
      .mockRejectedValueOnce(new ProviderAdapterError({ code: "SOURCE_TIMEOUT" }))
      .mockRejectedValueOnce(new ProviderAdapterError({ code: "SOURCE_UNAVAILABLE" }))
      .mockResolvedValueOnce(success);

    const result = await collectCatalog({ reason: "scheduled", now, maxAttempts: 2 }, deps);

    expect(deps.runProvider).toHaveBeenCalledTimes(2);
    expect(result.runs).toEqual([
      expect.objectContaining({ provider: "alpha", status: "failed" }),
    ]);
    expect(deps.finishRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-alpha",
      status: "failed",
      errorCode: "SOURCE_UNAVAILABLE",
    }));
  });

  it("does nothing before the provider's six-hour due time", async () => {
    const deps = dependencies([provider("alpha", "2026-08-08T00:01:00.000Z")]);

    const result = await collectCatalog({ reason: "scheduled", now, maxAttempts: 2 }, deps);

    expect(result.runs).toEqual([]);
    expect(deps.claimRun).not.toHaveBeenCalled();
    expect(deps.runProvider).not.toHaveBeenCalled();
    expect(deps.finishRun).not.toHaveBeenCalled();
  });

  it("claims a provider once six hours have elapsed", async () => {
    const deps = dependencies([provider("alpha", "2026-08-08T00:00:00.000Z")]);
    deps.claimRun.mockResolvedValue(null);

    await collectCatalog({ reason: "scheduled", now, maxAttempts: 2 }, deps);

    expect(deps.claimRun).toHaveBeenCalledOnce();
    expect(deps.runProvider).not.toHaveBeenCalled();
  });

  it("records provider-observed freshness instead of completion time", async () => {
    const deps = dependencies();

    const result = await collectCatalog({ reason: "scheduled", now, maxAttempts: 2 }, deps);

    expect(result.runs).toEqual([
      expect.objectContaining({ provider: "alpha", status: "succeeded", lastSuccessAt: success.fetchedAt }),
    ]);
    expect(deps.finishRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-alpha",
      status: "succeeded",
      lastSuccessAt: success.fetchedAt,
    }));
  });

  it("isolates one provider failure and still completes the next provider", async () => {
    const deps = dependencies([provider("alpha"), provider("beta")]);
    deps.runProvider.mockImplementation(async ({ providerCode }: { providerCode: string }) => {
      if (providerCode === "alpha") throw new ProviderAdapterError({ code: "SOURCE_AUTH_INVALID" });
      return success;
    });

    const result = await collectCatalog({ reason: "scheduled", now, maxAttempts: 2 }, deps);

    expect(deps.runProvider).toHaveBeenCalledTimes(2);
    expect(result.runs).toEqual([
      expect.objectContaining({ provider: "alpha", status: "failed" }),
      expect.objectContaining({ provider: "beta", status: "succeeded" }),
    ]);
    expect(deps.finishRun).toHaveBeenCalledTimes(2);
  });
});
function databaseClient() {
  const query = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    update() { return this; },
    then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve({
        data: [{ code: "fixture-page", enabled: true, last_success_at: null, refresh_interval_minutes: 360 }],
        error: null,
      }).then(resolve);
    },
  };
  const rpc = vi.fn(async (name: string, _args?: unknown) => {
    void _args;
    if (name === "claim_collection_run") return { data: [{ id: "00000000-0000-4000-8000-000000000201" }], error: null };
    if (name === "consume_provider_quota") {
      return { data: [{ allowed: true, scheduled_calls: 1, reserve_calls: 0, hard_limit: 500 }], error: null };
    }
    return { data: [{ upserted_count: 0, closed_count: 0 }], error: null };
  });
  return { client: { from: () => query, rpc }, rpc };
}

describe("collector run contracts", () => {
  it("keeps scheduled runs incremental unless reconciliation is explicit", async () => {
    const incremental = dependencies([provider("alpha", "2026-08-08T00:00:00.000Z")]);
    await collectCatalog({ reason: "scheduled", now }, incremental);
    expect(incremental.claimRun).toHaveBeenCalledWith(expect.objectContaining({ runKind: "incremental" }));
    expect(incremental.runProvider).toHaveBeenCalledWith(expect.objectContaining({
      runKind: "incremental",
      changedSince: "2026-08-08T00:00:00.000Z",
    }));

    const reconciliation = dependencies([provider("alpha", "2026-08-08T00:00:00.000Z")]);
    await collectCatalog({ reason: "scheduled", runKind: "reconciliation", now }, reconciliation);
    expect(reconciliation.claimRun).toHaveBeenCalledWith(expect.objectContaining({ runKind: "reconciliation" }));
    expect(reconciliation.runProvider).toHaveBeenCalledWith(expect.objectContaining({
      runKind: "reconciliation",
      changedSince: null,
    }));
  });

  it("isolates a claim failure and continues with the next provider", async () => {
    const deps = dependencies([provider("alpha"), provider("beta")]);
    deps.claimRun.mockImplementation(async ({ providerCode }: { providerCode: string }) => {
      if (providerCode === "alpha") throw new Error("database unavailable");
      return { id: "run-beta" };
    });

    const result = await collectCatalog({ reason: "scheduled", now }, deps);

    expect(deps.claimRun).toHaveBeenCalledTimes(2);
    expect(deps.runProvider).toHaveBeenCalledOnce();
    expect(result.runs).toEqual([expect.objectContaining({ provider: "beta", status: "succeeded" })]);
    expect(result.claimFailures).toEqual(["alpha"]);
  });

  it("fails the invocation when every due provider claim fails", async () => {
    const deps = dependencies([provider("alpha"), provider("beta")]);
    deps.claimRun.mockRejectedValue(new Error("database unavailable"));

    await expect(collectCatalog({ reason: "scheduled", now }, deps)).rejects.toThrow("COLLECTION_CLAIM_FAILED");
    expect(deps.runProvider).not.toHaveBeenCalled();
  });

  it("caps one collector invocation at ten providers", async () => {
    const deps = dependencies(Array.from({ length: 12 }, (_, index) => provider(`provider-${String(index).padStart(2, "0")}`)));

    await collectCatalog({ reason: "scheduled", now, maxProviders: 99 }, deps);

    expect(deps.claimRun).toHaveBeenCalledTimes(10);
    expect(deps.runProvider).toHaveBeenCalledTimes(10);
  });

  it("fails a provider when its cursor repeats", async () => {
    const { client } = databaseClient();
    const fetchPage = vi.spyOn(pageCursorFixtureAdapter, "fetchPage")
      .mockResolvedValue({ items: [], nextCursor: "repeat", total: null, snapshotComplete: false, quotaCost: 1, fetchedAt: now.toISOString() });
    try {
      const result = await collectCatalog({ reason: "scheduled", now, client: client as never });
      expect(fetchPage).toHaveBeenCalledTimes(2);
      expect(result.runs).toEqual([expect.objectContaining({ provider: "fixture-page", status: "failed" })]);
    } finally {
      fetchPage.mockRestore();
    }
  });

  it("rejects an adapter page that violates the common runtime contract", async () => {
    const { client, rpc } = databaseClient();
    const fetchPage = vi.spyOn(pageCursorFixtureAdapter, "fetchPage").mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
      snapshotComplete: false,
      quotaCost: 1,
      fetchedAt: "not-a-utc-timestamp",
    });
    try {
      const result = await collectCatalog({ reason: "scheduled", now, client: client as never });
      expect(result.runs).toEqual([expect.objectContaining({ provider: "fixture-page", status: "failed" })]);
      expect(rpc.mock.calls.some(([name]) => name === "ingest_source_postings")).toBe(false);
    } finally {
      fetchPage.mockRestore();
    }
  });
  it("rejects quota costs that the one-call reservation cannot account for", async () => {
    const { client, rpc } = databaseClient();
    const fetchPage = vi.spyOn(pageCursorFixtureAdapter, "fetchPage").mockResolvedValue({
      items: [], nextCursor: null, total: 0, snapshotComplete: false, quotaCost: 2, fetchedAt: now.toISOString(),
    });
    try {
      const result = await collectCatalog({ reason: "scheduled", now, client: client as never });
      expect(result.runs).toEqual([expect.objectContaining({ status: "failed" })]);
      expect(rpc.mock.calls.some(([name]) => name === "ingest_source_postings")).toBe(false);
    } finally {
      fetchPage.mockRestore();
    }
  });

  it("stops before fetching a 101st page", async () => {
    const { client } = databaseClient();
    let page = 0;
    const fetchPage = vi.spyOn(pageCursorFixtureAdapter, "fetchPage").mockImplementation(async () => ({
      items: [],
      nextCursor: `page:${++page}`,
      total: null,
      snapshotComplete: false,
      quotaCost: 1,
      fetchedAt: now.toISOString(),
    }));
    try {
      const result = await collectCatalog({ reason: "scheduled", now, client: client as never });
      expect(fetchPage).toHaveBeenCalledTimes(100);
      expect(result.runs).toEqual([expect.objectContaining({ provider: "fixture-page", status: "failed" })]);
    } finally {
      fetchPage.mockRestore();
    }
  });
});
describe("collector snapshot finalization", () => {
  it.each([
    ["incremental", false],
    ["reconciliation", true],
  ] as const)("finalizes %s with snapshotComplete=%s", async (runKind, expectedSnapshot) => {
    const { client, rpc } = databaseClient();
    const fetchPage = vi.spyOn(pageCursorFixtureAdapter, "fetchPage").mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
      snapshotComplete: runKind === "reconciliation",
      quotaCost: 1,
      fetchedAt: now.toISOString(),
    });
    try {
      await collectCatalog({ reason: "scheduled", runKind, now, client: client as never });
      const finalCall = rpc.mock.calls.find(([name, args]) => (
        name === "ingest_source_postings"
        && (args as { target_finalize?: boolean } | undefined)?.target_finalize === true
      ));
      expect(finalCall?.[1]).toMatchObject({
        target_finalize: true,
        target_snapshot_complete: expectedSnapshot,
      });
    } finally {
      fetchPage.mockRestore();
    }
  });

  it("does not finalize a reconciliation when provider totals change between pages", async () => {
    const { client, rpc } = databaseClient();
    const fetchPage = vi.spyOn(pageCursorFixtureAdapter, "fetchPage")
      .mockResolvedValueOnce({ items: [], nextCursor: "page:1", total: 1, snapshotComplete: false, quotaCost: 1, fetchedAt: now.toISOString() })
      .mockResolvedValueOnce({ items: [], nextCursor: null, total: 0, snapshotComplete: true, quotaCost: 1, fetchedAt: now.toISOString() });
    try {
      const result = await collectCatalog({ reason: "scheduled", runKind: "reconciliation", now, client: client as never });
      expect(result.runs).toEqual([expect.objectContaining({ status: "failed" })]);
      expect(rpc.mock.calls.some(([name, args]) => name === "ingest_source_postings" && (args as { target_finalize?: boolean }).target_finalize)).toBe(false);
    } finally {
      fetchPage.mockRestore();
    }
  });

  it("does not ingest a final snapshot page whose item count does not equal total", async () => {
    const { client, rpc } = databaseClient();
    const fetchPage = vi.spyOn(pageCursorFixtureAdapter, "fetchPage").mockResolvedValue({
      items: [], nextCursor: null, total: 1, snapshotComplete: true, quotaCost: 1, fetchedAt: now.toISOString(),
    });
    try {
      const result = await collectCatalog({ reason: "scheduled", runKind: "reconciliation", now, client: client as never });
      expect(result.runs).toEqual([expect.objectContaining({ status: "failed" })]);
      expect(rpc.mock.calls.some(([name]) => name === "ingest_source_postings")).toBe(false);
    } finally {
      fetchPage.mockRestore();
    }
  });

  it("rejects duplicate provider identities across reconciliation pages", async () => {
    const { client, rpc } = databaseClient();
    const first = (await pageCursorFixtureAdapter.fetchPage({
      cursor: null,
      runKind: "reconciliation",
      changedSince: null,
      scope: { roleCodes: [], locationCodes: [] },
      runId: "00000000-0000-4000-8000-000000000201",
      signal: new AbortController().signal,
    })).items[0]!;
    const fetchPage = vi.spyOn(pageCursorFixtureAdapter, "fetchPage")
      .mockResolvedValueOnce({ items: [first], nextCursor: "page:1", total: 2, snapshotComplete: false, quotaCost: 1, fetchedAt: now.toISOString() })
      .mockResolvedValueOnce({ items: [first], nextCursor: null, total: 2, snapshotComplete: true, quotaCost: 1, fetchedAt: now.toISOString() });
    try {
      const result = await collectCatalog({ reason: "scheduled", runKind: "reconciliation", now, client: client as never });
      expect(result.runs).toEqual([expect.objectContaining({ status: "failed" })]);
      expect(rpc.mock.calls.filter(([name]) => name === "ingest_source_postings")).toHaveLength(1);
    } finally {
      fetchPage.mockRestore();
    }
  });

  it("maps normalize failures to a stable response error before ingest", async () => {
    const { client, rpc } = databaseClient();
    const page = await pageCursorFixtureAdapter.fetchPage({
      cursor: null,
      runKind: "incremental",
      changedSince: null,
      scope: { roleCodes: [], locationCodes: [] },
      runId: "00000000-0000-4000-8000-000000000201",
      signal: new AbortController().signal,
    });
    const fetchPage = vi.spyOn(pageCursorFixtureAdapter, "fetchPage").mockResolvedValue({
      ...page,
      nextCursor: null,
      total: page.items.length,
    });
    const normalize = vi.spyOn(pageCursorFixtureAdapter, "normalize").mockImplementation(() => {
      throw new Error("raw provider detail");
    });
    try {
      const result = await collectCatalog({ reason: "scheduled", now, client: client as never });
      expect(result.runs).toEqual([expect.objectContaining({ status: "failed" })]);
      expect(rpc.mock.calls.some(([name]) => name === "ingest_source_postings")).toBe(false);
    } finally {
      fetchPage.mockRestore();
      normalize.mockRestore();
    }
  });
});
