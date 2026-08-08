import Link from "next/link";

import { FeedStatus } from "@/components/feed-status";
import { FocusAnchor } from "@/components/focus-anchor";
import { AppliedFeedFilters, FeedFilters, Filters } from "@/components/filters";
import { CatalogJobList, JobList } from "@/components/job-list";
import { requireUser } from "@/lib/auth";
import type { FeedQueryInput } from "@/lib/validation/feed";
import { getCatalogFeed, getJobs, usesAutomaticFeed, type JobFilters } from "./queries";

function moreHref(input: FeedQueryInput, take: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const scalar = typeof value === "string" ? value : value?.[0];
    if (scalar && key !== "take") params.set(key, scalar);
  }
  params.set("take", String(take));
  return `/jobs?${params}`;
}

function currentListPath(input: FeedQueryInput) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const scalar = typeof value === "string" ? value : value?.[0];
    if (scalar) params.set(key, scalar);
  }
  return params.size ? `/jobs?${params}` : "/jobs";
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<FeedQueryInput> }) {
  const user = await requireUser();
  const input = await searchParams;

  if (await usesAutomaticFeed()) {
    const feed = await getCatalogFeed(input);
    const hasFilters = Boolean(feed.query.q || feed.query.region || feed.query.role || feed.query.career || feed.query.employment || feed.query.deadline || feed.query.source);
    return (
      <div className="stack">
        <FocusAnchor />
        <header className="page-heading">
          <div>
            <p className="eyebrow">JOB FEED</p>
            <h1>채용공고</h1>
            <p className="muted">{feed.total}개의 공고</p>
            {feed.health !== "degraded" && feed.enabledProviderCount >= 2 && <p>복수 출처 통합</p>}
          </div>
        </header>
        <FeedFilters values={feed.query} />
        <AppliedFeedFilters values={feed.query} />
        <FeedStatus feed={feed} />
        {feed.health !== "preparing" && feed.health !== "failed" && feed.total === 0 ? (
          <section className="card stack">
            <h2>조건에 맞는 공고가 없습니다</h2>
            <p>적용된 조건: {hasFilters ? "검색 및 필터" : "없음"}</p>
            <p className="muted">정보 없음 공고는 활성 필터 결과에서 제외됩니다.</p>

          </section>
        ) : <CatalogJobList jobs={feed.items} returnTo={currentListPath(input)} />}
        {feed.hasMore && feed.query.take < 1_020 && <Link className="button secondary more-results" href={moreHref(input, feed.query.take + 30)}>공고 더 보기</Link>}
      </div>
    );
  }

  const filters = input as JobFilters;
  const jobs = await getJobs(filters, user.id);
  return (
    <div className="stack">
      <header className="page-heading"><div><p className="eyebrow">MY JOBS</p><h1>채용공고</h1><p className="muted">{jobs.length}개의 공고</p></div></header>
      <Filters values={filters} />
      <JobList jobs={jobs} />
    </div>
  );
}