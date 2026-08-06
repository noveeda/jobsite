import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { setE2EBackup } from "@/lib/e2e/backup-store";
import { createClient } from "@/lib/supabase/server";
import { validateBackupText } from "@/lib/validation/backup";

export async function POST(request: Request) {
  await requireUser();
  const validation = validateBackupText(await request.text());
  if (!validation.success) {
    return NextResponse.json(
      { code: validation.code, message: "유효하지 않은 백업입니다.", errors: validation.errors },
      { status: validation.code === "BACKUP_TOO_LARGE" ? 413 : 422 },
    );
  }

  if (process.env.E2E_BYPASS_AUTH === "true") {
    setE2EBackup(validation.data);
    return NextResponse.json({
      jobs: validation.data.jobs.length,
      sources: validation.data.sources.length,
      duplicatePairs: validation.data.duplicatePairs.length,
      revisions: validation.data.revisions.length,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("commit_backup_restore", {
    target_payload: validation.data,
    target_device: crypto.randomUUID(),
  });
  if (error) {
    return NextResponse.json({ code: "RESTORE_FAILED", message: "복원에 실패해 모든 변경을 되돌렸습니다." }, { status: 409 });
  }
  return NextResponse.json(data);
}