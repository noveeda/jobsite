import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { validateBackupText } from "@/lib/validation/backup";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await requireUser();
  const validation = validateBackupText(await request.text());
  if (!validation.success) {
    return NextResponse.json(
      { code: validation.code, message: "유효하지 않은 백업입니다.", errors: validation.errors },
      { status: validation.code === "BACKUP_TOO_LARGE" ? 413 : 422 },
    );
  }

  let conflicts = 1;
  if (process.env.E2E_BYPASS_AUTH !== "true") {
    const ids = validation.data.jobs.map((job) => job.id);
    if (ids.length === 0) conflicts = 0;
    else {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("id", ids);
      if (error) return NextResponse.json({ code: "VALIDATION_FAILED", message: "충돌을 확인하지 못했습니다." }, { status: 500 });
      conflicts = count ?? 0;
    }
  }

  return NextResponse.json({
    valid: true,
    schemaVersion: validation.data.schemaVersion,
    counts: {
      jobs: validation.data.jobs.length,
      sources: validation.data.sources.length,
      duplicatePairs: validation.data.duplicatePairs.length,
      revisions: validation.data.revisions.length,
    },
    conflicts,
    warnings: [],
  });
}