"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isE2EBypass } from "@/lib/environment";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policy";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ConsentActionState = Readonly<{
  ok: false;
  code: "CONSENT_REQUIRED" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" | "SAVE_FAILED";
  message: string;
  fieldErrors?: Readonly<{
    termsAccepted?: string;
    privacyAccepted?: string;
  }>;
  retryAfter?: number;
}> | null;

export async function acceptCurrentPolicies(
  _previousState: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const termsAccepted = formData.get("termsAccepted") === "on";
  const privacyAccepted = formData.get("privacyAccepted") === "on";

  if (!termsAccepted || !privacyAccepted) {
    return {
      ok: false,
      code: "CONSENT_REQUIRED",
      message: "이용약관과 개인정보 처리방침에 모두 동의해 주세요.",
      fieldErrors: {
        ...(!termsAccepted ? { termsAccepted: "이용약관 동의가 필요합니다." } : {}),
        ...(!privacyAccepted ? { privacyAccepted: "개인정보 처리방침 동의가 필요합니다." } : {}),
      },
    };
  }

  const user = await requireUser();

  if (!isE2EBypass()) {
    const authenticatedClient = await createClient();
    const rateLimit = await consumeRateLimit(authenticatedClient, "consent_write");
    if (!rateLimit.allowed) {
      return rateLimit.unavailable ? {
        ok: false,
        code: "SERVICE_UNAVAILABLE",
        message: "동의 저장 서비스를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        retryAfter: rateLimit.retryAfter,
      } : {
        ok: false,
        code: "RATE_LIMITED",
        message: "동의 저장 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        retryAfter: rateLimit.retryAfter,
      };
    }

    try {
      const { error } = await createAdminClient()
        .from("account_consents")
        .upsert({
          user_id: user.id,
          terms_version: CURRENT_TERMS_VERSION,
          privacy_version: CURRENT_PRIVACY_VERSION,
        }, {
          onConflict: "user_id,terms_version,privacy_version",
          ignoreDuplicates: true,
        });
      if (error) throw error;
    } catch {
      return {
        ok: false,
        code: "SAVE_FAILED",
        message: "동의를 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
      };
    }
  }

  redirect("/jobs");
}
