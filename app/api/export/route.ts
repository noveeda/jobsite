import { isE2EBypass } from "@/lib/environment";
import { NextResponse } from "next/server";
import { logSafeEvent, requestId } from "@/lib/observability/safe-logger";
import { requireUser } from "@/lib/auth";
import { createPortableBackup } from "@/lib/domain/backup";
import { getE2EBackup } from "@/lib/e2e/backup-store";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const started = performance.now();
  const user = await requireUser();
  try {
    const backup = isE2EBypass()
      ? getE2EBackup()
      : await createPortableBackup(await createClient(), user.id);
    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="job-hub-export-${day}.json"`,
        "cache-control": "no-store",
        "x-request-id": id,
      },
    });
  } catch {
    logSafeEvent({ requestId: id, category: "export", outcome: "failure", errorCode: "EXPORT_FAILED", durationMs: performance.now() - started });
    return NextResponse.json({ code: "EXPORT_FAILED", message: "내보내기를 완료하지 못했습니다.", requestId: id }, { status: 500, headers: { "cache-control": "no-store", "x-request-id": id } });
  }
}