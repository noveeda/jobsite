import { disableSourceProvider } from "./actions";

import { requireCurrentOperator } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function SourceSettingsPage() {
  await requireCurrentOperator();
  const admin = createAdminClient();
  const [{ data: providers, error: providerError }, { data: runs, error: runError }] = await Promise.all([
    admin.from("source_providers")
      .select("code,display_name,enabled,access_mode,last_success_at,last_error_code,updated_at")
      .order("code"),
    admin.from("collection_runs")
      .select("id,provider_code,status,run_kind,started_at,finished_at,fetched_count,upserted_count,closed_count,error_code")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (providerError || runError) throw new Error("SOURCE_OPERATIONS_UNAVAILABLE");

  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">SOURCE OPERATIONS</p>
          <h1>자동 수집 출처</h1>
          <p className="muted">승인 상태, 최근 실행 결과와 긴급 비활성화를 관리합니다.</p>
        </div>
      </header>

      <section className="card stack" aria-labelledby="providers-heading">
        <h2 id="providers-heading">출처 상태</h2>
        {(providers ?? []).map((provider) => (
          <article className="stack" key={provider.code}>
            <p><strong>{provider.display_name}</strong> · {provider.enabled ? "사용 중" : "중지됨"}</p>
            <p className="muted">{provider.code} · 최근 성공 {provider.last_success_at ?? "없음"} · 오류 {provider.last_error_code ?? "없음"}</p>
            {provider.enabled && (
              <form action={disableSourceProvider}>
                <input type="hidden" name="providerCode" value={provider.code} />
                <button className="button" type="submit">긴급 중지</button>
              </form>
            )}
          </article>
        ))}
        {!providers?.length && <p className="muted">등록된 출처가 없습니다.</p>}
      </section>

      <section className="card stack" aria-labelledby="runs-heading">
        <h2 id="runs-heading">최근 수집 실행</h2>
        {(runs ?? []).map((run) => (
          <p key={run.id}>
            <strong>{run.provider_code}</strong> · {run.status} · 가져옴 {run.fetched_count} · 반영 {run.upserted_count}
            {run.error_code ? ` · 오류 ${run.error_code}` : ""}
          </p>
        ))}
        {!runs?.length && <p className="muted">실행 기록이 없습니다.</p>}
      </section>
    </div>
  );
}
