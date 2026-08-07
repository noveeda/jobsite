import { isE2EBypass, isE2ERateLimitTestSupport } from "@/lib/environment";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { refreshSource, type RefreshJob, type RefreshSourceInput } from "@/lib/sources/connector";
import { createClient } from "@/lib/supabase/server";
import { logSafeEvent, requestId } from "@/lib/observability/safe-logger";
import { consumeRateLimit } from "@/lib/security/rate-limit";

type TestRefresh = { checkedAt: string; lastSuccessAt: string | null; status: "active" | "unreachable" | "unsupported" };
const testGlobal = globalThis as typeof globalThis & { __jobHubSourceRefresh?: Map<string, TestRefresh> };
const testRefreshes = testGlobal.__jobHubSourceRefresh ??= new Map<string, TestRefresh>();

async function testResponse(id: string) {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const previous = testRefreshes.get(id);
  if (previous && Date.now() - new Date(previous.checkedAt).getTime() < 30 * 60 * 1000) {
    return { ...previous, changedFields: [], cached: true, job: {} };
  }
  const checkedAt = new Date().toISOString();
  const value: TestRefresh = id.endsWith("5")
    ? { status: "unsupported", checkedAt, lastSuccessAt: null }
    : id.endsWith("4")
      ? { status: "unreachable", checkedAt, lastSuccessAt: "2026-08-01T03:00:00Z" }
      : { status: "active", checkedAt, lastSuccessAt: checkedAt };
  testRefreshes.set(id, value);
  return { ...value, changedFields: value.status === "active" ? ["deadlineAt"] : [], cached: false, job: {} };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = requestId(request.headers.get("x-request-id"));
  const user = await requireUser();
  const { id: jobId } = await params;
  if (isE2ERateLimitTestSupport()) {
    const limit = await consumeRateLimit(await createClient(), "source_refresh");
    if (!limit.allowed) {
      logSafeEvent({ requestId: id, category: "source_refresh", outcome: "denied", errorCode: limit.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED" });
      return NextResponse.json(
        { code: limit.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED", message: "요청이 많습니다. 저장된 공고는 변경되지 않았습니다.", requestId: id },
        { status: limit.unavailable ? 503 : 429, headers: { "retry-after": String(limit.retryAfter) } },
      );
    }
  }
  if (isE2EBypass()) return NextResponse.json(await testResponse(jobId));

  let sourceId = "";
  try {
    sourceId = String((await request.json()).sourceId ?? "");
  } catch {
    return NextResponse.json({ code: "INVALID_REQUEST", message: "출처를 확인할 수 없습니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: source } = await supabase
    .from("job_sources")
    .select("id,job_id,provider,connector_mode,external_id,original_url,status,last_checked_at,last_success_at")
    .eq("id", sourceId)
    .eq("job_id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: job } = await supabase
    .from("jobs")
    .select("id,title,company_name,role_name,locations,deadline_at,deadline_kind,field_provenance")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!source || !job) {
    return NextResponse.json({ code: "NOT_FOUND", message: "저장된 공고 또는 출처를 찾을 수 없습니다." }, { status: 404 });
  }

  const limit = await consumeRateLimit(supabase, "source_refresh");
  if (!limit.allowed) {
    logSafeEvent({ requestId: id, category: "source_refresh", outcome: "denied", errorCode: limit.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED" });
    return NextResponse.json({ code: limit.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED", message: "요청이 많습니다. 저장된 공고는 변경되지 않았습니다.", requestId: id }, { status: limit.unavailable ? 503 : 429, headers: { "retry-after": String(limit.retryAfter) } });
  }

  const storedJob: RefreshJob = {
    title: job.title,
    companyName: job.company_name,
    roleName: job.role_name,
    locations: job.locations,
    deadlineAt: job.deadline_at,
    deadlineKind: job.deadline_kind,
    fieldProvenance: job.field_provenance as RefreshJob["fieldProvenance"],
  };
  const input: RefreshSourceInput = {
    job: storedJob,
    source: {
      id: source.id,
      provider: source.provider,
      connectorMode: source.connector_mode,
      externalId: source.external_id,
      originalUrl: source.original_url,
      status: source.status,
      lastCheckedAt: source.last_checked_at,
      lastSuccessAt: source.last_success_at,
    },
  };

  try {
    const result = await refreshSource(input, {
      persist: async (outcome) => {
        const { error } = await supabase.rpc("record_source_refresh", {
          target_source_id: outcome.sourceId,
          target_status: outcome.status,
          target_fields_changed: outcome.changedFields,
          target_error_code: outcome.errorCode as unknown as string,
          target_source_values: outcome.sourceValues,
          target_job_patch: outcome.jobPatch,
        });
        if (error) throw error;
      },
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      status: "unreachable",
      checkedAt: new Date().toISOString(),
      lastSuccessAt: source.last_success_at,
      changedFields: [],
      errorCode: "SOURCE_UNAVAILABLE",
      cached: false,
      job: storedJob,
    });
  }
}