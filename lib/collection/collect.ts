import type { SupabaseClient } from "@supabase/supabase-js";

import { prepareSourcePosting } from "@/lib/collection/normalize";
import { claimCollectionRun, consumeProviderQuota } from "@/lib/collection/quota";
import { pageCursorFixtureAdapter, tokenCursorFixtureAdapter } from "@/lib/sources/fixtures/adapters";
import { createSaraminCatalogAdapter } from "@/lib/sources/saramin";
import {
  ProviderAdapterError,
  type FetchPageInput,
  type ProviderAdapter,
  type ProviderErrorCode,
  type ProviderPage,
  type SourcePostingInput,
} from "@/lib/sources/provider-adapter";
import type { Database, Json } from "@/lib/supabase/database.types";
import { collectionRequestSchema, providerPageSchema } from "@/lib/validation/collection";

export type CollectableProvider = {
  code: string;
  enabled: boolean;
  lastSuccessAt: string | null;
  refreshIntervalMinutes: number;
};

export type CollectorRunResult = {
  runId: string;
  provider: string;
  status: "succeeded" | "failed";
  fetched: number;
  upserted: number;
  closed: number;
  nextRetryAt: string | null;
  lastSuccessAt: string | null;
};

const MAX_PAGES_PER_RUN = 100;

type RunProviderResult = {
  fetched: number;
  upserted: number;
  closed: number;
  fetchedAt: string;
  snapshotComplete: boolean;
};

type FinishRunInput = {
  runId: string;
  providerCode: string;
  status: "succeeded" | "failed";
  fetched: number;
  upserted: number;
  closed: number;
  lastSuccessAt: string | null;
  nextRetryAt: string | null;
  errorCode?: ProviderErrorCode;
  finishedAt: string;
};

export type CollectorDependencies = {
  listProviders(): Promise<readonly CollectableProvider[]>;
  claimRun(input: {
    providerCode: string;
    scheduleBucket: string;
    runKind: "incremental" | "reconciliation";
  }): Promise<{ id: string } | null>;
  runProvider(input: {
    providerCode: string;
    runId: string;
    runKind: "incremental" | "reconciliation";
    changedSince: string | null;
    signal: AbortSignal;
  }): Promise<RunProviderResult>;
  finishRun(input: FinishRunInput): Promise<void>;
};

export type CollectCatalogInput = {
  reason: "scheduled";
  now: Date;
  providerCode?: string;
  runKind?: "incremental" | "reconciliation";
  maxAttempts?: number;
  maxProviders?: number;
  client?: SupabaseClient<Database>;
};

type RuntimeAdapter = {
  configuration: ProviderAdapter<unknown>["configuration"];
  fetchPage(input: FetchPageInput): Promise<ProviderPage<unknown>>;
  normalize(record: unknown, fetchedAt: string): SourcePostingInput;
};

function adapterFor(providerCode: string): RuntimeAdapter {
  if (providerCode === pageCursorFixtureAdapter.configuration.code) {
    return pageCursorFixtureAdapter as unknown as RuntimeAdapter;
  }
  if (providerCode === tokenCursorFixtureAdapter.configuration.code) {
    return tokenCursorFixtureAdapter as unknown as RuntimeAdapter;
  }
  if (providerCode === "saramin") {
    return createSaraminCatalogAdapter(fetch) as unknown as RuntimeAdapter;
  }
  throw new ProviderAdapterError({ code: "CONNECTOR_DISABLED" });
}

function hourlyBucket(now: Date) {
  const bucket = new Date(now);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.toISOString();
}

function isDue(provider: CollectableProvider, now: Date) {
  if (!provider.enabled) return false;
  if (!provider.lastSuccessAt) return true;
  const lastSuccess = Date.parse(provider.lastSuccessAt);
  return Number.isFinite(lastSuccess)
    && lastSuccess + provider.refreshIntervalMinutes * 60_000 <= now.getTime();
}

function retryAt(error: unknown, now: Date): string | null {
  if (!(error instanceof ProviderAdapterError)) return null;
  if (error.retry.strategy === "after") {
    return error.retry.resetAt
      ?? new Date(now.getTime() + (error.retry.retryAfterMs ?? 0)).toISOString();
  }
  return error.retry.strategy === "bounded"
    ? new Date(now.getTime() + 5 * 60_000).toISOString()
    : null;
}

function stableErrorCode(error: unknown): ProviderErrorCode {
  return error instanceof ProviderAdapterError ? error.code : "SOURCE_UNAVAILABLE";
}

function canRetry(error: unknown) {
  return error instanceof ProviderAdapterError && error.retry.strategy === "bounded";
}

function asJson(value: unknown): Json {
  return value as Json;
}

function databaseDependencies(client: SupabaseClient<Database>, requestedProvider?: string): CollectorDependencies {
  return {
    async listProviders() {
      let query = client.from("source_providers")
        .select("code,enabled,last_success_at,refresh_interval_minutes")
        .eq("enabled", true)
        .order("code");
      if (requestedProvider) query = query.eq("code", requestedProvider);
      const { data, error } = await query;
      if (error) throw new Error("COLLECTION_DATABASE_UNAVAILABLE");
      return (data ?? []).map((provider) => ({
        code: provider.code,
        enabled: provider.enabled,
        lastSuccessAt: provider.last_success_at,
        refreshIntervalMinutes: provider.refresh_interval_minutes,
      }));
    },

    async claimRun(input) {
      const run = await claimCollectionRun(client, {
        providerCode: input.providerCode,
        scheduleBucket: input.scheduleBucket,
        runKind: input.runKind,
      });
      return run ? { id: run.id } : null;
    },

    async runProvider(input) {
      const adapter = adapterFor(input.providerCode);
      let cursor: string | null = null;
      let fetched = 0;
      let upserted = 0;
      let closed = 0;
      let fetchedAt = input.changedSince ?? new Date().toISOString();
      let snapshotComplete = false;
      let pageCount = 0;
      let expectedTotal: number | null | undefined;
      const seenCursors = new Set<string>();
      const seenPostingIdentities = new Set<string>();

      do {
        if (pageCount >= MAX_PAGES_PER_RUN) {
          throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
        }
        const cursorKey = cursor ?? "__first_page__";
        if (seenCursors.has(cursorKey)) {
          throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
        }
        seenCursors.add(cursorKey);
        pageCount += 1;
        const quota = await consumeProviderQuota(client, { providerCode: input.providerCode });
        if (!quota.allowed) {
          const resetAt = new Date();
          resetAt.setUTCDate(resetAt.getUTCDate() + 1);
          resetAt.setUTCHours(0, 0, 0, 0);
          throw new ProviderAdapterError({
            code: "SOURCE_RATE_LIMITED",
            retry: { strategy: "after", resetAt: resetAt.toISOString() },
          });
        }

        let page: ProviderPage<unknown>;
        try {
          const request = collectionRequestSchema.parse({
            cursor,
            runKind: input.runKind,
            changedSince: input.runKind === "incremental" && adapter.configuration.capabilities.incremental ? input.changedSince : null,
            scope: { roleCodes: [], locationCodes: [] },
            runId: input.runId,
            signal: input.signal,
          });
          page = providerPageSchema.parse(await adapter.fetchPage(request));
        } catch (error) {
          if (error instanceof ProviderAdapterError) throw error;
          throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" }, { cause: error });
        }
        if (expectedTotal === undefined) expectedTotal = page.total;
        else if (page.total !== expectedTotal) {
          throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
        }

        let postings: ReturnType<typeof prepareSourcePosting>[];
        try {
          postings = page.items.map((record) => prepareSourcePosting(
            adapter.configuration,
            adapter.normalize(record, page.fetchedAt),
          ));
        } catch (error) {
          throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" }, { cause: error });
        }
        for (const posting of postings) {
          const identity = `${posting.providerCode}\u0000${posting.externalId}`;
          if (seenPostingIdentities.has(identity)) {
            throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
          }
          seenPostingIdentities.add(identity);
        }

        const nextFetched = fetched + page.items.length;
        if (page.snapshotComplete && (
          input.runKind !== "reconciliation"
          || page.nextCursor !== null
          || expectedTotal === null
          || nextFetched !== expectedTotal
        )) {
          throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
        }
        const { data, error } = await client.rpc("ingest_source_postings", {
          target_provider_code: input.providerCode,
          target_run_id: input.runId,
          target_postings: asJson(postings),
          target_finalize: false,
          target_snapshot_complete: false,
        });
        if (error || !data?.[0]) throw new Error("COLLECTION_DATABASE_UNAVAILABLE");
        fetched = nextFetched;
        upserted += data[0].upserted_count;
        fetchedAt = page.fetchedAt;
        snapshotComplete = input.runKind === "reconciliation" && page.snapshotComplete;
        cursor = page.nextCursor;
      } while (cursor !== null);

      const { data, error } = await client.rpc("ingest_source_postings", {
        target_provider_code: input.providerCode,
        target_run_id: input.runId,
        target_postings: [],
        target_finalize: true,
        target_snapshot_complete: snapshotComplete,
      });
      if (error || !data?.[0]) throw new Error("COLLECTION_DATABASE_UNAVAILABLE");
      upserted += data[0].upserted_count;
      closed += data[0].closed_count;
      return { fetched, upserted, closed, fetchedAt, snapshotComplete };
    },

    async finishRun(input) {
      if (input.status === "succeeded") return;
      const [{ error: runError }, { error: providerError }] = await Promise.all([
        client.from("collection_runs").update({
          status: "failed",
          lease_until: null,
          finished_at: input.finishedAt,
          next_retry_at: input.nextRetryAt,
          error_code: input.errorCode ?? "SOURCE_UNAVAILABLE",
          error_summary: input.errorCode ?? "SOURCE_UNAVAILABLE",
        }).eq("id", input.runId),
        client.from("source_providers").update({
          last_error_code: input.errorCode ?? "SOURCE_UNAVAILABLE",
        }).eq("code", input.providerCode),
      ]);
      if (runError || providerError) throw new Error("COLLECTION_DATABASE_UNAVAILABLE");
    },
  };
}

export async function collectCatalog(
  input: CollectCatalogInput,
  providedDependencies?: CollectorDependencies,
): Promise<{ runs: CollectorRunResult[]; claimFailures: string[] }> {
  const dependencies = providedDependencies
    ?? (input.client ? databaseDependencies(input.client, input.providerCode) : null);
  if (!dependencies) throw new Error("COLLECTION_DATABASE_UNAVAILABLE");

  const maxAttempts = Math.min(3, Math.max(1, input.maxAttempts ?? 2));
  const availableProviders = await dependencies.listProviders();
  if (input.providerCode && !availableProviders.some((provider) => provider.code === input.providerCode)) {
    throw new Error("SOURCE_PROVIDER_UNKNOWN");
  }
  const providers = availableProviders
    .filter((provider) => (!input.providerCode || provider.code === input.providerCode) && isDue(provider, input.now))
    .sort((left, right) => left.code < right.code ? -1 : left.code > right.code ? 1 : 0)
    .slice(0, Math.min(10, Math.max(1, input.maxProviders ?? 5)));
  const scheduleBucket = hourlyBucket(input.now);
  const runKind = input.runKind ?? "incremental";
  const runs: CollectorRunResult[] = [];
  const claimFailures: string[] = [];

  for (const provider of providers) {
    let claim: { id: string } | null;
    try {
      claim = await dependencies.claimRun({
        providerCode: provider.code,
        scheduleBucket,
        runKind,
      });
    } catch {
      claimFailures.push(provider.code);
      continue;
    }
    if (!claim) continue;

    let outcome: RunProviderResult | null = null;
    let failure: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        outcome = await dependencies.runProvider({
          providerCode: provider.code,
          runId: claim.id,
          runKind,
          changedSince: runKind === "incremental" ? provider.lastSuccessAt : null,
          signal: AbortSignal.timeout(25_000),
        });
        failure = undefined;
        break;
      } catch (error) {
        failure = error;
        if (!canRetry(error) || attempt === maxAttempts) break;
      }
    }

    if (outcome) {
      const finish: FinishRunInput = {
        runId: claim.id,
        providerCode: provider.code,
        status: "succeeded",
        fetched: outcome.fetched,
        upserted: outcome.upserted,
        closed: outcome.closed,
        lastSuccessAt: outcome.fetchedAt,
        nextRetryAt: null,
        finishedAt: input.now.toISOString(),
      };
      try {
        await dependencies.finishRun(finish);
      } catch {
        // The provider result remains isolated; the database implementation already finalized success.
      }
      runs.push({
        runId: claim.id,
        provider: provider.code,
        status: "succeeded",
        fetched: outcome.fetched,
        upserted: outcome.upserted,
        closed: outcome.closed,
        nextRetryAt: null,
        lastSuccessAt: outcome.fetchedAt,
      });
      continue;
    }

    const errorCode = stableErrorCode(failure);
    const nextRetryAt = retryAt(failure, input.now);
    try {
      await dependencies.finishRun({
        runId: claim.id,
        providerCode: provider.code,
        status: "failed",
        fetched: 0,
        upserted: 0,
        closed: 0,
        lastSuccessAt: provider.lastSuccessAt,
        nextRetryAt,
        errorCode,
        finishedAt: input.now.toISOString(),
      });
    } catch {
      // Continue with other providers even if failure persistence is unavailable.
    }
    runs.push({
      runId: claim.id,
      provider: provider.code,
      status: "failed",
      fetched: 0,
      upserted: 0,
      closed: 0,
      nextRetryAt,
      lastSuccessAt: provider.lastSuccessAt,
    });
  }

  if (providers.length > 0 && claimFailures.length === providers.length) {
    throw new Error("COLLECTION_CLAIM_FAILED");
  }
  return { runs, claimFailures };
}
