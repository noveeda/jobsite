const DEFAULT_POLICY_EFFECTIVE_DATE = "2026-08-07";

function isIsoCalendarDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export const CURRENT_TERMS_VERSION = "2026-08-07" as const;
export const CURRENT_PRIVACY_VERSION = "2026-08-07" as const;
export const POLICY_EFFECTIVE_DATE = isIsoCalendarDate(process.env.PUBLIC_POLICY_EFFECTIVE_DATE)
  ? process.env.PUBLIC_POLICY_EFFECTIVE_DATE
  : DEFAULT_POLICY_EFFECTIVE_DATE;

export const CURRENT_POLICY = Object.freeze({
  termsVersion: CURRENT_TERMS_VERSION,
  privacyVersion: CURRENT_PRIVACY_VERSION,
  effectiveDate: POLICY_EFFECTIVE_DATE,
});

export type ConsentRecord = Readonly<{
  termsVersion: string | null;
  privacyVersion: string | null;
  agreedAt: string | null;
}>;

export type ConsentStatus = Readonly<{
  termsCurrent: boolean;
  privacyCurrent: boolean;
  hasAgreementTime: boolean;
  complete: boolean;
}>;

export function consentStatus(record: ConsentRecord | null | undefined): ConsentStatus {
  const termsCurrent = record?.termsVersion === CURRENT_TERMS_VERSION;
  const privacyCurrent = record?.privacyVersion === CURRENT_PRIVACY_VERSION;
  const hasAgreementTime = typeof record?.agreedAt === "string"
    && record.agreedAt.length > 0
    && Number.isFinite(Date.parse(record.agreedAt));

  return {
    termsCurrent,
    privacyCurrent,
    hasAgreementTime,
    complete: termsCurrent && privacyCurrent && hasAgreementTime,
  };
}

export function hasCurrentConsent(record: ConsentRecord | null | undefined): boolean {
  return consentStatus(record).complete;
}

export const ACCOUNT_DELETION_CONFIRMATION = "회원탈퇴" as const;

export function isExactAccountDeletionConfirmation(value: unknown): boolean {
  return value === ACCOUNT_DELETION_CONFIRMATION;
}
