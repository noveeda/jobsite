import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { logSafeEvent, requestId } from "@/lib/observability/safe-logger";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin, readLimitedText, RequestTooLargeError } from "@/lib/security/request";
import { previewSource } from "@/lib/sources/connector";
import { createClient } from "@/lib/supabase/server";
import { sourceUrlSchema } from "@/lib/validation/jobs";

const requestSchema = z.object({ url: sourceUrlSchema });
export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  await requireUser();
  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_NOT_ALLOWED", message: "허용되지 않은 요청입니다.", requestId: id }, { status: 403 });
  let value: unknown;
  try {
    value = JSON.parse(await readLimitedText(request, 2048));
  } catch (error) {
    const status = error instanceof RequestTooLargeError ? 413 : 400;
    return NextResponse.json({ code: status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_URL", message: "유효한 HTTPS URL을 입력해 주세요.", requestId: id }, { status });
  }
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) return NextResponse.json({ code: "INVALID_URL", message: "유효한 HTTPS URL을 입력해 주세요.", requestId: id }, { status: 400 });

  const limit = await consumeRateLimit(await createClient(), "source_preview");
  if (!limit.allowed) {
    logSafeEvent({ requestId: id, category: "source_preview", outcome: "denied", errorCode: limit.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED" });
    return NextResponse.json(
      { code: limit.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED", message: "요청이 많습니다. 잠시 후 다시 시도해 주세요.", requestId: id },
      { status: limit.unavailable ? 503 : 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }

  try {
    const preview = await previewSource(parsed.data.url);
    return NextResponse.json({ source: preview.reference, draft: preview.result?.values ?? null, provenance: preview.result?.provenance ?? {}, warnings: preview.warnings }, { headers: { "x-request-id": id } });
  } catch {
    logSafeEvent({ requestId: id, category: "source_preview", outcome: "failure", errorCode: "SOURCE_UNAVAILABLE" });
    return NextResponse.json({ code: "SOURCE_UNAVAILABLE", message: "출처를 확인하지 못했습니다. 수동으로 입력해 주세요.", requestId: id }, { status: 502 });
  }
}
