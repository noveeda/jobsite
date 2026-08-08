import Link from "next/link";
import { notFound } from "next/navigation";

import { DuplicatePanel } from "@/components/duplicate-panel";
import { JobDetail, type JobRevisionView } from "@/components/job-detail";
import { ProviderAttribution } from "@/components/provider-attribution";
import { SourceStatus } from "@/components/source-status";
import { requireUser } from "@/lib/auth";
import { getDiscoveryScenario } from "@/lib/e2e/automatic-discovery";
import { discoveryFeedFixtures } from "@/lib/e2e/discovery-feed";
import { getTestJob } from "@/lib/e2e/job-store";
import { isE2EBypass } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";
import { catalogJobDetailSchema, type CatalogFeedItem } from "@/lib/validation/feed";

function CatalogDetail({ job, returnTo }: { job: CatalogFeedItem; returnTo: string }) {
  return (
    <div className="stack">
      <section className="card stack">
        <div><p className="muted">{job.companyName}</p><h1>{job.title}</h1><p>{job.roleName ?? "정보 없음"} · {job.locations.join(", ") || "정보 없음"}</p></div>
        <p>{job.experienceText ?? "경력 정보 없음"} · {job.educationText ?? "학력 정보 없음"}</p>
        {job.sources.map((source) => (
          <div className="source-attribution" key={`${source.provider}:${source.originalUrl}`}>
            <div className="row"><strong>{source.providerName}</strong><a className="touch-target" href={source.originalUrl} target="_blank" rel="noopener noreferrer">원문 보기</a></div>
            <p className="muted">마지막 확인 {new Date(source.lastObservedAt).toLocaleString("ko-KR")}</p>
          </div>
        ))}
      </section>
      <Link className="button secondary" href={returnTo}>목록으로 돌아가기</Link>
      <section className="card"><p>개인 저장과 지원 관리는 다음 단계에서 제공됩니다.</p></section>
    </div>
  );
}

function safeReturnTo(value: string | undefined) {
  return value && /^\/jobs(?:[?#]|$)/.test(value) && !value.startsWith("//") ? value : "/jobs";
}

export default async function JobDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const scenario = await getDiscoveryScenario();

  if (isE2EBypass()) {
    if (scenario) {
      const catalogJob = discoveryFeedFixtures.find((job) => job.id === id);
      if (!catalogJob) notFound();
      return <CatalogDetail job={catalogJob} returnTo={returnTo} />;
    }
    const state = getTestJob(id);
    const source = { id, status: id.endsWith("5") ? "unsupported" as const : id.endsWith("4") ? "unreachable" as const : "unknown" as const, lastSuccessAt: id.endsWith("4") ? "2026-08-01T03:00:00Z" : null };
    return (
      <div className="stack">
        <section className="card stack">
          <div><p className="muted">예시 회사</p><h1>백엔드 개발자</h1></div>
          <ProviderAttribution provider="other" connectorMode="manual" originalUrl="https://example.com/job/1" />
          <SourceStatus jobId={id} source={source} />
        </section>
        <JobDetail job={state} revisions={state.revisions} userId={user.id} testMode />
        <DuplicatePanel pairs={[{ id: "30000000-0000-4000-8000-000000000001", score: .9, reasons: { company: true, role: true, location: true }, decision: "suggested" }]} />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id,title,company_name,role_name,summary,memo,next_action_at,application_status,updated_at,job_sources(id,provider,connector_mode,original_url,status,first_observed_at,last_success_at),duplicate_pairs!duplicate_pairs_left_job_id_fkey(id,score,reasons,decision)")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (jobError) throw new Error("JOB_DETAIL_UNAVAILABLE");

  if (job) {
    const { data: revisionRows, error: revisionError } = await supabase.from("job_revisions")
      .select("id,snapshot,changed_at,device_id,change_kind").eq("job_id", id).eq("user_id", user.id)
      .order("changed_at", { ascending: false }).limit(100);
    if (revisionError) throw new Error("JOB_DETAIL_UNAVAILABLE");
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
          <div><p className="muted">{job.company_name}</p><h1>{job.title}</h1><p>{job.role_name ?? "정보 없음"}</p><p>{job.summary}</p></div>
          <div className="stack">{job.job_sources.map((source) => (
            <div className="stack" key={source.id}>
              <ProviderAttribution provider={source.provider} connectorMode={source.connector_mode} originalUrl={source.original_url} />
              <p className="muted">최초 관찰 {new Date(source.first_observed_at).toLocaleString("ko-KR")}{source.last_success_at ? ` · 마지막 확인 성공 ${new Date(source.last_success_at).toLocaleString("ko-KR")}` : ""}</p>
              <SourceStatus jobId={job.id} source={{ id: source.id, status: source.status, lastSuccessAt: source.last_success_at }} />
            </div>
          ))}</div>
        </section>
        <JobDetail job={{ id: job.id, applicationStatus: job.application_status, memo: job.memo, nextActionAt: job.next_action_at, updatedAt: job.updated_at }} revisions={revisions} userId={user.id} />
        <DuplicatePanel pairs={job.duplicate_pairs.map((pair) => ({ id: pair.id, score: pair.score, reasons: pair.reasons as Record<string, unknown>, decision: pair.decision }))} />
      </div>
    );
  }

  const { data, error } = await supabase.rpc("get_catalog_job_detail", { target_id: id });
  if (error) throw new Error("CATALOG_DETAIL_UNAVAILABLE");
  const detail = catalogJobDetailSchema.safeParse(data);
  if (!detail.success) throw new Error("CATALOG_DETAIL_INVALID");
  if (!detail.data) notFound();
  return <CatalogDetail returnTo={returnTo} job={detail.data} />;
}