import type { CatalogFeed } from "@/app/(dashboard)/jobs/queries";

export function latestEnabledSuccess(feed: CatalogFeed) {
  return feed.providerHealth
    .filter(({ enabled }) => enabled)
    .map(({ lastSuccessAt }) => lastSuccessAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;
}

function lastSuccess(feed: CatalogFeed) {
  const value = latestEnabledSuccess(feed);
  return value ? new Date(value).toLocaleString("ko-KR") : "확인되지 않음";
}

export function FeedStatus({ feed }: { feed: CatalogFeed }) {
  if (feed.health === "preparing") return (
    <section className="card stack" role="status">
      <p>공고를 처음 수집하고 있습니다. 잠시 후 다시 확인해 주세요.</p>
      <div className="feed-skeleton" aria-label="공고 불러오는 중" />
    </section>
  );
  if (feed.health === "partial") return (
    <section className="card stack warning-card" role="alert">
      <strong>일부 출처를 갱신하지 못했습니다.</strong>
      <span>마지막 성공 {lastSuccess(feed)}</span>
      <span>{feed.cached ? "이전에 확인한 공고를 함께 표시합니다." : "정상 출처에서 확인된 공고만 표시합니다."}</span>
    </section>
  );
  if (feed.health === "failed") return (
    <section className="card stack warning-card" role="alert">
      <strong>모든 출처의 최신 갱신에 실패했습니다.</strong>
      <span>{feed.cached ? "마지막으로 확인된 공고를 표시합니다. 잠시 후 다시 시도해 주세요." : "현재 표시할 공고가 없습니다. 잠시 후 다시 시도해 주세요."}</span>
    </section>
  );
  if (feed.health === "degraded") return (
    <section className="card stack warning-card" role="alert">
      <strong>공개 기준을 충족하지 못했습니다.</strong>
      <span>운영자가 출처 상태를 확인하고 있습니다.</span>
    </section>
  );
  return null;
}