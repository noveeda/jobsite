import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTestJob } from "@/lib/e2e/job-store";
import { createClient } from "@/lib/supabase/server";
import { DuplicatePanel } from "@/components/duplicate-panel";
import { JobDetail, type JobRevisionView } from "@/components/job-detail";
import { SourceStatus } from "@/components/source-status";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  if (process.env.E2E_BYPASS_AUTH === "true") {
    const state = getTestJob(id);
    const source = {
      id,
      status: id.endsWith("5") ? "unsupported" as const : id.endsWith("4") ? "unreachable" as const : "unknown" as const,
      lastSuccessAt: id.endsWith("4") ? "2026-08-01T03:00:00Z" : null,
    };
    return (
      <div className="stack">
        <section className="card stack">
          <div>
            <p className="muted">예시 회사</p>
            <h1>백엔드 개발자</h1>
          </div>
          <div className="row">
            <a href="https://example.com/job/1">원문 확인 ↗</a>
            <SourceStatus jobId={id} source={source} />
          </div>
        </section>
        <JobDetail job={state} revisions={state.revisions} userId={user.id} testMode />
        <DuplicatePanel pairs={[{ id: "30000000-0000-4000-8000-000000000001", score: .9, reasons: { company: true, role: true, location: true }, decision: "suggested" }]} />
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: job }, { data: revisionRows }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id,title,company_name,role_name,summary,memo,next_action_at,application_status,updated_at,job_sources(id,provider,original_url,status,last_success_at),duplicate_pairs!duplicate_pairs_left_job_id_fkey(id,score,reasons,decision)")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("job_revisions")
      .select("id,snapshot,changed_at,device_id,change_kind")
      .eq("job_id", id)
      .eq("user_id", user.id)
      .order("changed_at", { ascending: false })
      .limit(100),
  ]);
  if (!job) notFound();

  const revisions: JobRevisionView[] = (revisionRows ?? []).map((row) => ({
    id: row.id,
    snapshot: row.snapshot as JobRevisionView["snapshot"],
    changedAt: row.changed_at,
    deviceId: row.device_id,
    changeKind: row.change_kind,
  }));

  return (
    <div className="stack">
      <section className="card stack">
        <div>
          <p className="muted">{job.company_name}</p>
          <h1>{job.title}</h1>
          <p>{job.role_name ?? "정보 없음"}</p>
          <p>{job.summary}</p>
        </div>
        <div className="stack">
          {job.job_sources.map((source) => (
            <div className="row" key={source.id}>
              <a href={source.original_url} target="_blank" rel="noreferrer">{source.provider} 원문 ↗</a>
              <SourceStatus jobId={job.id} source={{ id: source.id, status: source.status, lastSuccessAt: source.last_success_at }} />
            </div>
          ))}
        </div>
      </section>
      <JobDetail
        job={{ id: job.id, applicationStatus: job.application_status, memo: job.memo, nextActionAt: job.next_action_at, updatedAt: job.updated_at }}
        revisions={revisions}
        userId={user.id}
      />
      <DuplicatePanel pairs={job.duplicate_pairs.map((pair) => ({ id: pair.id, score: pair.score, reasons: pair.reasons as Record<string, unknown>, decision: pair.decision }))} />
    </div>
  );
}