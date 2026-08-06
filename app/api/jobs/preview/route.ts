import { NextResponse } from "next/server";
import { z } from "zod";
import { previewSource } from "@/lib/sources/connector";
import { sourceUrlSchema } from "@/lib/validation/jobs";

const requestSchema = z.object({ url: sourceUrlSchema });
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_URL", message: "유효한 HTTPS URL을 입력해 주세요." }, { status: 400 });
  const preview = await previewSource(parsed.data.url);
  return NextResponse.json({ source: preview.reference, draft: preview.result?.values ?? null, provenance: preview.result?.provenance ?? {}, warnings: preview.warnings });
}
