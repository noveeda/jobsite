import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createPortableBackup } from "@/lib/domain/backup";
import { getE2EBackup } from "@/lib/e2e/backup-store";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await requireUser();
  try {
    const backup = process.env.E2E_BYPASS_AUTH === "true"
      ? getE2EBackup()
      : await createPortableBackup(await createClient(), user.id);
    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="job-hub-export-${day}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ code: "EXPORT_FAILED", message: "내보내기를 완료하지 못했습니다." }, { status: 500 });
  }
}