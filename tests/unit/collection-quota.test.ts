import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  claimCollectionRun,
  CollectionDatabaseError,
  consumeProviderQuota,
} from "@/lib/collection/quota";
import type { Database } from "@/lib/supabase/database.types";

const run = {
  attempt_count: 1,
  closed_count: 0,
  created_at: "2026-08-08T00:00:00Z",
  cursor: null,
  error_code: null,
  error_summary: null,
  fetched_count: 0,
  finished_at: null,
  id: "00000000-0000-4000-8000-000000000001",
  lease_until: "2026-08-08T00:05:00Z",
  next_retry_at: null,
  provider_code: "fixture-core",
  quota_used: 0,
  run_kind: "incremental",
  schedule_bucket: "2026-08-08T00:00:00Z",
  snapshot_complete: false,
  started_at: "2026-08-08T00:00:00Z",
  status: "running",
  upserted_count: 0,
};

function client(rpc: ReturnType<typeof vi.fn>): SupabaseClient<Database> {
  return { rpc } as never;
}

describe("database-backed collection lease and quota", () => {
  it("claims a run using only the database lease RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [run], error: null });

    await expect(claimCollectionRun(client(rpc), {
      providerCode: "fixture-core",
      scheduleBucket: "2026-08-08T00:00:00Z",
    })).resolves.toEqual(run);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("claim_collection_run", {
      target_provider_code: "fixture-core",
      target_schedule_bucket: "2026-08-08T00:00:00Z",
      target_run_kind: "incremental",
      target_lease_seconds: 300,
    });
  });

  it("treats an empty claim as a database-controlled no-op", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await expect(claimCollectionRun(client(rpc), {
      providerCode: "fixture-core",
      scheduleBucket: "2026-08-08T01:00:00Z",
    })).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each([
    { allowed: true, scheduled_calls: 10, reserve_calls: 0, hard_limit: 500 },
    { allowed: false, scheduled_calls: 400, reserve_calls: 100, hard_limit: 500 },
  ])("maps the atomic quota decision without a provider-call dependency: %j", async (decision) => {
    const rpc = vi.fn().mockResolvedValue({ data: [decision], error: null });

    await expect(consumeProviderQuota(client(rpc), {
      providerCode: "fixture-core",
      bucket: "scheduled",
      amount: 1,
    })).resolves.toEqual({
      allowed: decision.allowed,
      scheduledCalls: decision.scheduled_calls,
      reserveCalls: decision.reserve_calls,
      hardLimit: decision.hard_limit,
    });
    expect(rpc).toHaveBeenCalledWith("consume_provider_quota", {
      target_provider_code: "fixture-core",
      target_bucket: "scheduled",
      target_amount: 1,
    });
  });

  it.each([
    ["claim-run", () => claimCollectionRun(client(vi.fn().mockResolvedValue({ data: null, error: new Error("secret-db-detail") })), {
      providerCode: "fixture-core",
      scheduleBucket: "2026-08-08T00:00:00Z",
    })],
    ["consume-quota", () => consumeProviderQuota(client(vi.fn().mockResolvedValue({ data: [], error: null })), {
      providerCode: "fixture-core",
    })],
  ] as const)("uses a stable fail-closed error for %s", async (operation, invoke) => {
    const error = await invoke().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CollectionDatabaseError);
    expect(error).toMatchObject({
      code: "COLLECTION_DATABASE_UNAVAILABLE",
      message: "COLLECTION_DATABASE_UNAVAILABLE",
      operation,
    });
    expect(JSON.stringify(error)).not.toContain("secret-db-detail");
  });
});
