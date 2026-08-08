import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isE2EBypass } from "@/lib/environment";
import { logSafeEvent, requestId } from "@/lib/observability/safe-logger";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin, readLimitedText, RequestTooLargeError } from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";
import { validateBackupText } from "@/lib/validation/backup";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const user = await requireUser();
  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_NOT_ALLOWED", message: "허용되지 않은 요청입니다.", requestId: id }, { status: 403 });
  const supabase = await createClient();
  const limit = await consumeRateLimit(supabase, "import_validate");
  if (!limit.allowed) return NextResponse.json({ code: limit.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED", message: "요청이 많습니다. 잠시 후 다시 시도해 주세요.", requestId: id }, { status: limit.unavailable ? 503 : 429, headers: { "retry-after": String(limit.retryAfter) } });

  let text: string;
  try {
    text = await readLimitedText(request, MAX_BYTES);
  } catch (error) {
    if (error instanceof RequestTooLargeError) return NextResponse.json({ code: "BACKUP_TOO_LARGE", message: "백업은 10 MiB 이하여야 합니다.", requestId: id }, { status: 413 });
    throw error;
  }
  const validation = validateBackupText(text);
  if (!validation.success) return NextResponse.json({ code: validation.code, message: "유효하지 않은 백업입니다.", errors: validation.errors, requestId: id }, { status: validation.code === "BACKUP_TOO_LARGE" ? 413 : 422 });

  const payload = validation.data;
  const isV1 = "schemaVersion" in payload;
  const legacy = isV1 ? payload : payload.legacy;

  let conflicts = 1;
  if (!isE2EBypass()) {
    const ids = legacy.jobs.map((job) => job.id);
    if (ids.length === 0) conflicts = 0;
    else {
      const { count, error } = await supabase.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("id", ids);
      if (error) {
        logSafeEvent({ requestId: id, category: "import_validate", outcome: "failure", errorCode: "VALIDATION_FAILED" });
        return NextResponse.json({ code: "VALIDATION_FAILED", message: "충돌을 확인하지 못했습니다.", requestId: id }, { status: 500 });
      }
      conflicts = count ?? 0;
    }
  }
  if (isV1) {
    return NextResponse.json({ valid: true, schemaVersion: payload.schemaVersion, counts: { jobs: legacy.jobs.length, sources: legacy.sources.length, duplicatePairs: legacy.duplicatePairs.length, revisions: legacy.revisions.length, personalStates: 0, duplicateDecisions: 0, manualLinks: 0 }, conflicts, warnings: [] }, { headers: { "x-request-id": id } });
  }
  return NextResponse.json({ valid: true, schemaVersion: payload.version, counts: { jobs: legacy.jobs.length, sources: legacy.sources.length, duplicatePairs: legacy.duplicatePairs.length, revisions: legacy.revisions.length, personalStates: payload.personalStates.length, duplicateDecisions: payload.duplicateDecisions.length, manualLinks: payload.manualLinks.length }, conflicts, warnings: ["버전 2 복원은 아직 준비 중입니다."] }, { headers: { "x-request-id": id } });
}
