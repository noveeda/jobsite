import { catalogFixtures } from "@/lib/sources/fixtures/catalog";
import type { DiscoveryScenario } from "@/lib/e2e/automatic-discovery";
import type { CatalogFeedItem, CatalogFeedResponse, FeedQuery } from "@/lib/validation/feed";

const providerNames: Record<string, string> = {
  "fixture-page": "Fixture Page",
  "fixture-token": "Fixture Token",
} as const;

function fixtureId(index: number) {
  return `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

export const discoveryFeedFixtures: readonly CatalogFeedItem[] = catalogFixtures.map((fixture, index) => {
  const career = fixture.career === "entry" ? [0, 0] : fixture.career === "experienced" ? [3, 5] : [null, null];
  return {
    id: fixtureId(index),
    title: fixture.title,
    companyName: fixture.companyName,
    roleName: fixture.roleName,
    locations: [...fixture.locations],
    employmentTypes: [fixture.employmentType === "permanent" ? "정규직" : fixture.employmentType === "contract" ? "계약직" : "인턴"],
    careerMinYears: career[0],
    careerMaxYears: career[1],
    experienceText: fixture.career,
    educationText: null,
    industry: null,
    jobCategories: [fixture.roleName],
    salaryText: null,
    postedAt: fixture.postedAt,
    deadlineKind: "fixed" as const,
    deadlineAt: fixture.expiresAt,
    lifecycleStatus: "active" as const,
    lastObservedAt: fixture.modifiedAt,
    personalState: { saved: false, excluded: false, applicationStatus: "unreviewed" as const, nextActionAt: null },
    sources: [{
      provider: fixture.providerCode,
      providerName: providerNames[fixture.providerCode],
      originalUrl: fixture.originalUrl,
      lastObservedAt: fixture.modifiedAt,
      attribution: {
        text: providerNames[fixture.providerCode],
        href: `https://${fixture.providerCode}.example.invalid`,
      },
    }],
  };
}).sort((left, right) =>
  String(right.postedAt).localeCompare(String(left.postedAt))
  || right.lastObservedAt.localeCompare(left.lastObservedAt)
  || left.id.localeCompare(right.id)
);

const performanceFeedFixtures: readonly CatalogFeedItem[] = Array.from({ length: 1_000 }, (_, index) => {
  const ordinal = index + 1;
  const observedAt = new Date(Date.UTC(2026, 7, 8, 12) - index * 60_000).toISOString();
  return {
    id: `20000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
    title: `백엔드 개발자 성능 ${ordinal}`,
    companyName: `서울 성능 기업 ${ordinal}`,
    roleName: "백엔드",
    locations: ["서울"],
    employmentTypes: ["정규직"],
    careerMinYears: 0,
    careerMaxYears: 0,
    experienceText: "entry",
    educationText: null,
    industry: null,
    jobCategories: ["백엔드"],
    salaryText: null,
    postedAt: observedAt,
    deadlineKind: "rolling" as const,
    deadlineAt: null,
    lifecycleStatus: "active" as const,
    lastObservedAt: observedAt,
    personalState: { saved: false, excluded: false, applicationStatus: "unreviewed" as const, nextActionAt: null },
    sources: [{
      provider: "fixture-page",
      providerName: providerNames["fixture-page"],
      originalUrl: `https://fixture-page.example.invalid/performance/${ordinal}`,
      lastObservedAt: observedAt,
      attribution: {
        text: providerNames["fixture-page"],
        href: "https://fixture-page.example.invalid",
      },
    }],
  };
});

export function matchesDiscoveryItem(item: CatalogFeedItem, query: FeedQuery) {
  const text = `${item.title} ${item.companyName} ${item.roleName ?? ""}`.toLocaleLowerCase("ko");
  const employment = query.employment === "permanent" ? "정규직" : query.employment === "contract" ? "계약직" : query.employment === "intern" ? "인턴" : query.employment;
  const deadline = item.deadlineAt ? Date.parse(item.deadlineAt) : null;
  const deadlineMatches = !query.deadline
    || (query.deadline === "unknown" && item.deadlineKind === "unknown")
    || (query.deadline === "active" && (item.deadlineKind === "rolling" || item.deadlineKind === "until_hired" || (deadline !== null && deadline >= Date.now())))
    || (query.deadline === "closingSoon" && deadline !== null && deadline >= Date.now() && deadline <= Date.now() + 7 * 86_400_000);
  const careerMatches = !query.career
    || (query.career === "entry" && item.careerMinYears === 0)
    || (query.career === "experienced" && (item.careerMaxYears ?? item.careerMinYears ?? 0) > 0)
    || (query.career === "any" && item.careerMinYears !== null)
    || (/^\d/.test(query.career) && item.careerMinYears !== null);
  return (!query.q || text.includes(query.q.toLocaleLowerCase("ko")))
    && (!query.region || item.locations.includes(query.region))
    && (!query.role || item.roleName === query.role)
    && careerMatches
    && (!employment || item.employmentTypes.includes(employment))
    && deadlineMatches
    && (!query.source || item.sources.some(({ provider }) => provider === query.source));
}

export function makeDiscoveryFeedFixture(scenario: DiscoveryScenario, query: FeedQuery): CatalogFeedResponse {
  if (scenario === "preparing") {
    return { items: [], total: 0, missingCounts: { region: 0, role: 0, career: 0, employment: 0, deadline: 0, source: 0 }, hasMore: false, enabledProviderCount: 0, providerHealth: [] };
  }

  const base = scenario === "failed-empty"
    ? []
    : scenario === "performance-1000"
      ? performanceFeedFixtures
    : scenario === "degraded"
      ? discoveryFeedFixtures.filter(({ sources }) => sources[0].provider === "fixture-page")
      : discoveryFeedFixtures;
  const filtered = base.filter((item) => matchesDiscoveryItem(item, query));
  const items = filtered.slice(0, query.take);
  const failed = scenario === "failed-cached" || scenario === "failed-empty";
  const unavailable = "SOURCE_UNAVAILABLE" as const;
  return {
    items,
    total: filtered.length,
    missingCounts: { region: 0, role: 0, career: 0, employment: 0, deadline: 0, source: 0 },
    hasMore: filtered.length > query.take,
    enabledProviderCount: scenario === "degraded" ? 1 : 2,
    providerHealth: [
      { code: "fixture-page", displayName: "Fixture Page", enabled: true, lastSuccessAt: "2026-08-08T09:00:00.000Z", errorCode: failed ? unavailable : null },
      ...(scenario === "degraded" ? [] : [{ code: "fixture-token", displayName: "Fixture Token", enabled: true, lastSuccessAt: "2026-08-08T08:00:00.000Z", errorCode: scenario === "partial" || failed ? unavailable : null }]),
    ],
  };
}
