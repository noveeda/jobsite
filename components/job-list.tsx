import Link from "next/link";
import type { JobListItem } from "@/app/(dashboard)/jobs/queries";
import { ProviderAttribution } from "@/components/provider-attribution";
import { deadlineState } from "@/lib/domain/deadlines";
import { PersonalListControls } from "@/components/personal-job-controls";

const observedDate = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

function formatObservedAt(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? observedDate.format(timestamp) : "확인되지 않음";
}

export function JobList({ jobs }: { jobs: JobListItem[] }) {
  if (!jobs.length) {
    return <div className="card"><p>조건에 맞는 공고가 없습니다.</p></div>;
  }

  return (
    <div className="job-list">
      {jobs.map((job) => {
        const deadline = deadlineState(job.deadlineKind, job.deadlineAt);
        return (
          <article className="card job-card" key={job.id}>
            <div>
              <p className="muted">{job.companyName}</p>
              <h2><Link href={`/jobs/${job.id}`}>{job.title}</Link></h2>
              <p>
                {job.roleName ?? "정보 없음"} · {job.locations.join(", ") || "정보 없음"} · {job.employmentTypes.join(", ") || "정보 없음"}
              </p>
            </div>
            <div className="job-meta">
              <span>{deadline.label}</span>
              <span>{job.applicationStatus}</span>
            </div>
            {job.sources.map((source) => (
              <div className="stack" key={`${source.provider}:${source.originalUrl}`}>
                <ProviderAttribution
                  provider={source.provider}
                  connectorMode={source.connectorMode}
                  originalUrl={source.originalUrl}
                />
                <p className="muted">
                  최초 확인 {formatObservedAt(source.firstObservedAt)} · 마지막 자동 갱신 {source.lastSuccessAt ? formatObservedAt(source.lastSuccessAt) : "없음"}
                </p>
              </div>
            ))}
          </article>
        );
      })}
    </div>
  );
}
export function CatalogJobList({ jobs, returnTo }: { jobs: import("@/lib/validation/feed").CatalogFeedItem[]; returnTo: string }) {
  return (
    <div className="job-list">
      {jobs.map((job) => {
        const deadline = deadlineState(job.deadlineKind, job.deadlineAt);
        return (
          <article className="card job-card" id={`job-${job.id}`} key={job.id} tabIndex={-1}>
            <div className="stack">
              <div>
                <p className="muted">{job.companyName}</p>
                <h2><Link className="touch-target" href={`/jobs/${job.id}?returnTo=${encodeURIComponent(`${returnTo}#job-${job.id}`)}`}>{job.title}</Link></h2>
                <p>{job.roleName ?? "정보 없음"} · {job.locations.join(", ") || "정보 없음"} · {job.employmentTypes.join(", ") || "정보 없음"}</p>
              </div>
              {job.sources.map((source) => (
                <div className="source-attribution" key={`${source.provider}:${source.originalUrl}`}>
                  <div className="row">
                    <strong>{source.providerName}</strong>
                    <a className="touch-target" href={source.originalUrl} target="_blank" rel="noopener noreferrer">원문 보기</a>
                    <a className="touch-target" href={source.attribution.href} target="_blank" rel="noopener noreferrer">{source.attribution.text}</a>
                  </div>
                  <p className="muted">마지막 확인 {formatObservedAt(source.lastObservedAt)}</p>
                </div>
              ))}
            </div>
            <div className="job-meta">
              <span>{deadline.label}</span>
              {job.lifecycleStatus === "stale" && <span>최신성 확인 중</span>}
              {job.lifecycleStatus === "closed" && <span>종료된 공고</span>}
              {job.lifecycleStatus === "withdrawn" && <span>출처 제공 중단</span>}
            </div>
            <PersonalListControls canonicalJobId={job.id} jobTitle={job.title} state={job.personalState} />
          </article>
        );
      })}
    </div>
  );
}
