import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  CURRENT_POLICY,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  POLICY_EFFECTIVE_DATE,
  consentStatus,
  hasCurrentConsent,
  isExactAccountDeletionConfirmation,
} from "@/lib/legal/policy";

const currentConsent = {
  termsVersion: CURRENT_TERMS_VERSION,
  privacyVersion: CURRENT_PRIVACY_VERSION,
  agreedAt: "2026-08-07T00:00:00.000Z",
};

describe("public policy versions", () => {
  it("exports one immutable, deterministic current policy", () => {
    expect(CURRENT_POLICY).toEqual({
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      effectiveDate: POLICY_EFFECTIVE_DATE,
    });
    expect(Object.isFrozen(CURRENT_POLICY)).toBe(true);
    expect(POLICY_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to the beta effective date when no valid public date is configured", () => {
    expect(POLICY_EFFECTIVE_DATE).toBe("2026-08-07");
  });
});

describe("consent completeness", () => {
  it("accepts only a record containing both current versions and a valid agreement time", () => {
    expect(hasCurrentConsent(currentConsent)).toBe(true);
    expect(consentStatus(currentConsent)).toEqual({
      termsCurrent: true,
      privacyCurrent: true,
      hasAgreementTime: true,
      complete: true,
    });
  });

  it.each([
    null,
    undefined,
    { ...currentConsent, termsVersion: "2026-08-06" },
    { ...currentConsent, privacyVersion: "2026-08-06" },
    { ...currentConsent, agreedAt: null },
    { ...currentConsent, agreedAt: "not-a-date" },
  ])("requires consent for incomplete or stale record %#", (record) => {
    expect(hasCurrentConsent(record)).toBe(false);
  });

  it("reports which policy version is stale", () => {
    expect(consentStatus({
      ...currentConsent,
      privacyVersion: "2026-08-06",
    })).toEqual({
      termsCurrent: true,
      privacyCurrent: false,
      hasAgreementTime: true,
      complete: false,
    });
  });
});

describe("account deletion confirmation", () => {
  it("accepts only the exact destructive confirmation", () => {
    expect(ACCOUNT_DELETION_CONFIRMATION).toBe("회원탈퇴");
    expect(isExactAccountDeletionConfirmation("회원탈퇴")).toBe(true);
    expect(isExactAccountDeletionConfirmation(" 회원탈퇴")).toBe(false);
    expect(isExactAccountDeletionConfirmation("회원탈퇴 ")).toBe(false);
    expect(isExactAccountDeletionConfirmation("회원 탈퇴")).toBe(false);
    expect(isExactAccountDeletionConfirmation(null)).toBe(false);
  });
});
