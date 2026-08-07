import type { SupabaseClient } from "@supabase/supabase-js";
import { isE2EBypass } from "@/lib/environment";
import { getE2EConsentState } from "@/lib/e2e/consent-store";
import {
  consentStatus,
  type ConsentRecord,
  type ConsentStatus,
} from "@/lib/legal/policy";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type ConsentLookupResult = Readonly<{
  record: ConsentRecord | null;
  status: ConsentStatus;
  unavailable: boolean;
}>;

function e2eConsent(): ConsentLookupResult {
  const { record, currentTermsVersion, currentPrivacyVersion } = getE2EConsentState();
  const hasAgreementTime = typeof record?.agreedAt === "string"
    && Number.isFinite(Date.parse(record.agreedAt));
  const termsCurrent = record?.termsVersion === currentTermsVersion;
  const privacyCurrent = record?.privacyVersion === currentPrivacyVersion;
  return {
    record,
    status: {
      termsCurrent,
      privacyCurrent,
      hasAgreementTime,
      complete: termsCurrent && privacyCurrent && hasAgreementTime,
    },
    unavailable: false,
  };
}

export async function getLatestConsent(
  userId: string,
  client?: SupabaseClient<Database>,
): Promise<ConsentLookupResult> {
  if (isE2EBypass()) return e2eConsent();

  const supabase = client ?? await createClient();
  const { data, error } = await supabase
    .from("account_consents")
    .select("terms_version,privacy_version,accepted_at")
    .eq("user_id", userId)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const status = consentStatus(null);
    return { record: null, status, unavailable: true };
  }

  const record: ConsentRecord | null = data ? {
    termsVersion: data.terms_version,
    privacyVersion: data.privacy_version,
    agreedAt: data.accepted_at,
  } : null;

  return { record, status: consentStatus(record), unavailable: false };
}

export async function hasLatestConsent(
  userId: string,
  client?: SupabaseClient<Database>,
): Promise<boolean> {
  return (await getLatestConsent(userId, client)).status.complete;
}
