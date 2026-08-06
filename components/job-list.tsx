import Link from "next/link";
import type { JobListItem } from "@/app/(dashboard)/jobs/queries";
import { ProviderAttribution } from "@/components/provider-attribution";
import { deadlineState } from "@/lib/domain/deadlines";

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