import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isE2EBypass } from "@/lib/environment";
import { setE2EBackup } from "@/lib/e2e/backup-store";
import { logSafeEvent, requestId } from "@/lib/observability/safe-logger";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin, readLimitedText, RequestTooLargeError } from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";
import { MAX_BACKUP_BYTES, validateBackupText } from "@/lib/validation/backup";

export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  await requireUser();
  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_NOT_ALLOWED", message: "허용되지 않은 요청입니다.", requestId: id }, { status: 403 });
  const supabase = await createClient();
  const limit = await consumeRateLimit(supabase, "import_commit");
  if (!limit.allowed) return NextResponse.json({ code: limit.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED", message: "요청이 많습니다. 잠시 후 다시 시도해 주세요.", requestId: id }, { status: limit.unavailable ? 503 : 429, headers: { "retry-after": String(limit.retryAfter) } });

  let text: string;
  try {
    text = await readLimitedText(request, MAX_BACKUP_BYTES);
  } catch (error) {
    if (error instanceof RequestTooLargeError) return NextResponse.json({ code: "BACKUP_TOO_LARGE", message: "백업은 10 MiB 이하여야 합니다.", requestId: id }, { status: 413 });
    throw error;
  }
  const validation = validateBackupText(text);
  if (!validation.success) return NextResponse.json({ code: validation.code, message: "유효하지 않은 백업입니다.", errors: validation.errors, requestId: id }, { status: validation.code === "BACKUP_TOO_LARGE" ? 413 : 422 });

  if (isE2EBypass()) {
    const legacy = "schemaVersion" in validation.data ? validation.data : validation.data.legacy;
    setE2EBackup(legacy);
    return NextResponse.json({ jobs: legacy.jobs.length, sources: legacy.sources.length, duplicatePairs: legacy.duplicatePairs.length, revisions: legacy.revisions.length }, { headers: { "x-request-id": id } });
  }

  const { data, error } = await supabase.rpc("commit_backup_restore", { target_payload: validation.data, target_device: crypto.randomUUID() });
  if (error) {
    logSafeEvent({ requestId: id, category: "import_commit", outcome: "failure", errorCode: "RESTORE_FAILED" });
    return NextResponse.json({ code: "RESTORE_FAILED", message: "복원에 실패해 모든 변경을 되돌렸습니다.", requestId: id }, { status: 409 });
  }
  return NextResponse.json(data, { headers: { "x-request-id": id } });
}
