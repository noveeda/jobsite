import { createClient } from "@/lib/supabase/server";
import { getDiscoveryScenario } from "@/lib/e2e/automatic-discovery";
import { discoveryFeedFixtures, makeDiscoveryFeedFixture, matchesDiscoveryItem } from "@/lib/e2e/discovery-feed";
import { getE2EPersonalState, getE2EUserId } from "@/lib/e2e/personal-state";
import { isE2EBypass } from "@/lib/environment";
import {
  catalogFeedResponseSchema,
  parseFeedQuery,
  type CatalogFeedResponse,
  type FeedQuery,
  type FeedQueryInput,
} from "@/lib/validation/feed";
import type { AttributionConnectorMode, AttributionProvider } from "@/components/provider-attribution";

export type FeedHealth = "ready" | "preparing" | "partial" | "failed" | "degraded";
export type CatalogFeed = CatalogFeedResponse & { query: FeedQuery; health: FeedHealth; cached: boolean };

function hasActiveCatalogFilter(query: FeedQuery) {
  return Boolean(query.q || query.region || query.role || query.career || query.employment || query.deadline || query.source || query.saved || query.includeExcluded);
}

export function catalogHealth(feed: CatalogFeedResponse, query: FeedQuery): FeedHealth {
  if (feed.enabledProviderCount === 0 && feed.total === 0) return "preparing";
  const enabledProviders = feed.providerHealth.filter(({ enabled }) => enabled);
  const failures = enabledProviders.filter(({ errorCode }) => errorCode !== null).length;
  if (feed.enabledProviderCount > 0 && failures === feed.enabledProviderCount) return "failed";
  if (failures > 0) return "partial";
  if (feed.enabledProviderCount < 2 || (!hasActiveCatalogFilter(query) && feed.total < 100)) return "degraded";
  return "ready";
}

export async function usesAutomaticFeed() {
  return process.env.AUTOMATIC_DISCOVERY_ENABLED === "true" || await getDiscoveryScenario() !== null;
}

export async function getCatalogFeed(input: FeedQueryInput): Promise<CatalogFeed> {
  const query = parseFeedQuery(input);
  const scenario = await getDiscoveryScenario();
  if (scenario === "exception") throw new Error("AUTOMATIC_DISCOVERY_FEED_UNAVAILABLE");

  let raw: unknown;
  if (scenario) {
    raw = makeDiscoveryFeedFixture(scenario, query);
    const userId = await getE2EUserId();
    if (userId) {
      const fixture = raw as CatalogFeedResponse;
      const fixtureCandidates = query.saved
        ? discoveryFeedFixtures.filter((item) => matchesDiscoveryItem(item, query))
        : fixture.items;
      const personalized = await Promise.all(fixtureCandidates.map(async (item) => {
        const state = await getE2EPersonalState(userId, item.id);
        const lifecycleStatus = item.id === "10000000-0000-4000-8000-000000000001"
          ? scenario === "closed-saved"
            ? "closed" as const
            : scenario === "withdrawn-saved"
              ? "withdrawn" as const
              : item.lifecycleStatus
          : item.lifecycleStatus;
        return {
          ...item,
          lifecycleStatus,
          personalState: {
            saved: state.saved,
            excluded: state.excluded,
            applicationStatus: state.applicationStatus,
            nextActionAt: state.nextActionAt,
          },
        };
      }));
      const visible = personalized.filter((item) =>
        (query.includeExcluded || !item.personalState.excluded)
        && (!query.saved || item.personalState.saved)
        && (
          item.lifecycleStatus === "active"
          || item.lifecycleStatus === "stale"
          || (query.saved && item.personalState.saved)
          || (query.includeExcluded && item.personalState.excluded)
        )
      );
      const removed = personalized.length - visible.length;
      raw = {
        ...fixture,
        items: visible.slice(0, query.take),
        total: query.saved ? visible.length : Math.max(0, fixture.total - removed),
        hasMore: query.saved ? visible.length > query.take : fixture.hasMore,
      };
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_catalog_feed", {
      target_filters: query,
      target_take: query.take,
    });
    if (error) throw new Error("AUTOMATIC_DISCOVERY_FEED_UNAVAILABLE");
    raw = data;
  }

  const feed = catalogFeedResponseSchema.safeParse(raw);
  if (!feed.success) throw new Error("AUTOMATIC_DISCOVERY_FEED_INVALID");
  const health = catalogHealth(feed.data, query);
  return { ...feed.data, query, health, cached: (health === "partial" || health === "failed") && feed.data.items.length > 0 };
}

export type JobListItem = {
  id: string;
  title: string;
  companyName: string;
  roleName: string | null;
  locations: string[];
  employmentTypes: string[];
  deadlineAt: string | null;
  deadlineKind: "fixed" | "rolling" | "until_hired" | "unknown";
  applicationStatus: string;
  createdAt: string;
  postedAt: string | null;
  sources: {
    provider: AttributionProvider;
    connectorMode: AttributionConnectorMode;
    originalUrl: string;
    firstObservedAt: string;
    lastSuccessAt: string | null;
  }[];
};

export type JobFilters = {
  q?: string;
  region?: string;
  status?: string;
  source?: string;
  deadline?: string;
  sort?: string;
  includeExcluded?: string;
};

const demoJobs = (): JobListItem[] => Array.from({ length: 100 }, (_, index) => {
  const observedAt = new Date(Date.now() - index * 86_400_000).toISOString();
  const isApprovedSaramin = index % 3 === 0;
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `테스트 개발자 ${index}`,
    companyName: `예시 회사 ${index}`,
    roleName: index % 2 ? "프론트엔드" : "백엔드",
    locations: [index % 2 ? "서울" : "부산"],
    employmentTypes: ["정규직"],
    deadlineAt: index % 3 === 0 ? new Date(Date.now() + index * 86_400_000).toISOString() : null,
    deadlineKind: index % 3 === 0 ? "fixed" : "unknown",
    applicationStatus: index === 99 ? "excluded" : "unreviewed",
    createdAt: new Date().toISOString(),
    postedAt: null,
    sources: [{
      provider: isApprovedSaramin ? "saramin" : "other",
      connectorMode: isApprovedSaramin ? "approved_api" : "manual",
      originalUrl: isApprovedSaramin
        ? `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${index}`
        : `https://example.com/jobs/${index}`,
      firstObservedAt: observedAt,
      lastSuccessAt: isApprovedSaramin ? observedAt : null,
    }],
  };
});

export async function getJobs(filters: JobFilters, userId: string): Promise<JobListItem[]> {
  let rows: JobListItem[];
  if (isE2EBypass()) {
    rows = demoJobs();
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("jobs")
      .select("id,title,company_name,role_name,locations,employment_types,deadline_at,deadline_kind,application_status,created_at,posted_at,job_sources(provider,connector_mode,original_url,first_observed_at,last_success_at)")
      .eq("user_id", userId)
      .limit(1000);
    if (error) throw new Error("공고 목록을 불러오지 못했습니다.");
    rows = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      companyName: row.company_name,
      roleName: row.role_name,
      locations: row.locations,
      employmentTypes: row.employment_types,
      deadlineAt: row.deadline_at,
      deadlineKind: row.deadline_kind,
      applicationStatus: row.application_status,
      createdAt: row.created_at,
      postedAt: row.posted_at,
      sources: row.job_sources.map((source) => ({
        provider: source.provider,
        connectorMode: source.connector_mode,
        originalUrl: source.original_url,
        firstObservedAt: source.first_observed_at,
        lastSuccessAt: source.last_success_at,
      })),
    }));
  }

  const q = filters.q?.toLocaleLowerCase("ko");
  rows = rows.filter((job) =>
    (filters.includeExcluded === "true" || job.applicationStatus !== "excluded")
    && (!q || `${job.companyName} ${job.title} ${job.roleName ?? ""}`.toLocaleLowerCase("ko").includes(q))
    && (!filters.region || job.locations.includes(filters.region))
    && (!filters.status || job.applicationStatus === filters.status)
    && (!filters.source || job.sources.some((source) => source.provider === filters.source))
  );
  const sort = filters.sort ?? "created";
  rows.sort((a, b) => sort === "posted"
    ? String(b.postedAt ?? "").localeCompare(String(a.postedAt ?? ""))
    : sort === "deadline"
      ? String(a.deadlineAt ?? "9999").localeCompare(String(b.deadlineAt ?? "9999"))
      : b.createdAt.localeCompare(a.createdAt));
  return rows;
}
