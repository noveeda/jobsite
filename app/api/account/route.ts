import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isE2EBypass } from "@/lib/environment";
import { logSafeEvent, requestId } from "@/lib/observability/safe-logger";
import { RequestTooLargeError, isSameOrigin, readLimitedText } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_BODY_BYTES = 1024;
const RECENT_SIGN_IN_MS = 10 * 60 * 1000;
const deletionSchema = z.strictObject({
  confirmation: z.literal("회원탈퇴"),
  exportAcknowledged: z.literal(true),
});

type ErrorOptions = {
  status: number;
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, string | number>;
  retryAfter?: number;
};

function errorResponse(options: ErrorOptions) {
  const headers = new Headers({
    "cache-control": "no-store",
    "x-request-id": options.requestId,
  });
  if (options.retryAfter) headers.set("retry-after", String(options.retryAfter));
  return NextResponse.json(
    {
      code: options.code,
      message: options.message,
      requestId: options.requestId,
      ...(options.details ? { details: options.details } : {}),
    },
    { status: options.status, headers },
  );
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  const id = requestId(request.headers.get("x-request-id"));
  const denied = (options: Omit<ErrorOptions, "requestId">) => {
    logSafeEvent({
      requestId: id,
      category: "account_delete",
      outcome: "denied",
      errorCode: options.code,
      durationMs: performance.now() - startedAt,
    });
    return errorResponse({ ...options, requestId: id });
  };

  const user = await requireUser();

  if (!isSameOrigin(request)) {
    return denied({ status: 403, code: "ORIGIN_NOT_ALLOWED", message: "허용되지 않은 요청입니다." });
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return denied({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE", message: "JSON 요청만 지원합니다." });
  }

  let rawBody: string;
  try {
    rawBody = await readLimitedText(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return denied({ status: 413, code: "PAYLOAD_TOO_LARGE", message: "요청 본문이 너무 큽니다." });
    }
    throw error;
  }

  const body = deletionSchema.safeParse((() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }
  })());
  if (!body.success) {
    return denied({ status: 400, code: "INVALID_CONFIRMATION", message: "탈퇴 확인 문구와 내보내기 확인이 필요합니다." });
  }

  if (!isE2EBypass()) {
    const lastSignInAt = "last_sign_in_at" in user ? Date.parse(user.last_sign_in_at ?? "") : Number.NaN;
    if (!Number.isFinite(lastSignInAt) || Date.now() - lastSignInAt > RECENT_SIGN_IN_MS) {
      return denied({
        status: 403,
        code: "REAUTH_REQUIRED",
        message: "계속하려면 Google 로그인을 다시 진행해 주세요.",
        details: { reauthenticateAt: "/login?next=%2Fsettings%2Faccount&reauth=1" },
      });
    }
  }

  const supabase = await createClient();
  const rateLimit = await consumeRateLimit(supabase, "account_delete");
  if (!rateLimit.allowed) {
    return denied({
      status: rateLimit.unavailable ? 503 : 429,
      code: rateLimit.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED",
      message: rateLimit.unavailable
        ? "요청 제한 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      retryAfter: rateLimit.retryAfter,
      details: { retryAfterSeconds: rateLimit.retryAfter },
    });
  }

  if (!isE2EBypass()) {
    try {
      const admin = createAdminClient();
      const { error } = await admin.auth.admin.deleteUser(user.id, false);
      if (error) throw error;
      await supabase.auth.signOut();
    } catch {
      logSafeEvent({
        requestId: id,
        category: "account_delete",
        outcome: "failure",
        errorCode: "ACCOUNT_DELETE_UNAVAILABLE",
        durationMs: performance.now() - startedAt,
      });
      return errorResponse({
        status: 503,
        code: "ACCOUNT_DELETE_UNAVAILABLE",
        message: "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        requestId: id,
      });
    }
  }

  logSafeEvent({
    requestId: id,
    category: "account_delete",
    outcome: "success",
    durationMs: performance.now() - startedAt,
  });
  return new NextResponse(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "x-request-id": id,
    },
  });
}
