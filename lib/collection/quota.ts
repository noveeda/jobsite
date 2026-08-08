import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type ClaimRow = Database["public"]["Functions"]["claim_collection_run"]["Returns"][number];
type QuotaRow = Database["public"]["Functions"]["consume_provider_quota"]["Returns"][number];

export type CollectionDatabaseOperation = "claim-run" | "consume-quota";

export class CollectionDatabaseError extends Error {
  readonly code = "COLLECTION_DATABASE_UNAVAILABLE" as const;

  constructor(readonly operation: CollectionDatabaseOperation) {
    super("COLLECTION_DATABASE_UNAVAILABLE");
    this.name = "CollectionDatabaseError";
  }
}

export type ClaimCollectionRunInput = {
  providerCode: string;
  scheduleBucket: string;
  runKind?: "incremental" | "reconciliation" | "bootstrap";
  leaseSeconds?: number;
};

export type ProviderQuotaDecision = {
  allowed: boolean;
  scheduledCalls: number;
  reserveCalls: number;
  hardLimit: number;
};

export async function claimCollectionRun(
  client: SupabaseClient<Database>,
  input: ClaimCollectionRunInput,
): Promise<ClaimRow | null> {
  try {
    const { data, error } = await client.rpc("claim_collection_run", {
      target_provider_code: input.providerCode,
      target_schedule_bucket: input.scheduleBucket,
      target_run_kind: input.runKind ?? "incremental",
      target_lease_seconds: input.leaseSeconds ?? 300,
    });
    if (error) throw error;
    return data?.[0] ?? null;
  } catch {
    throw new CollectionDatabaseError("claim-run");
  }
}

export async function consumeProviderQuota(
  client: SupabaseClient<Database>,
  input: {
    providerCode: string;
    bucket?: "scheduled" | "reserve";
    amount?: number;
    usageDate?: string;
  },
): Promise<ProviderQuotaDecision> {
  try {
    const { data, error } = await client.rpc("consume_provider_quota", {
      target_provider_code: input.providerCode,
      target_bucket: input.bucket ?? "scheduled",
      target_amount: input.amount ?? 1,
      ...(input.usageDate === undefined ? {} : { target_usage_date: input.usageDate }),
    });
    const decision: QuotaRow | undefined = data?.[0];
    if (error || !decision) throw error ?? new Error("missing quota decision");
    return {
      allowed: decision.allowed,
      scheduledCalls: decision.scheduled_calls,
      reserveCalls: decision.reserve_calls,
      hardLimit: decision.hard_limit,
    };
  } catch {
    throw new CollectionDatabaseError("consume-quota");
  }
}
