import { isE2EBypass } from "@/lib/environment";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  type ConsentRecord,
} from "@/lib/legal/policy";

export type E2EConsentScenario = "accepted" | "missing" | "write_failure" | "version_changed";

type E2EConsentState = {
  currentTermsVersion: string;
  currentPrivacyVersion: string;
  record: ConsentRecord | null;
  failNextWrite: boolean;
};

const testGlobal = globalThis as typeof globalThis & { __jobHubConsent?: E2EConsentState };

function assertE2E() {
  if (!isE2EBypass()) throw new Error("E2E consent state is disabled.");
}

function acceptedRecord(termsVersion: string, privacyVersion: string): ConsentRecord {
  return { termsVersion, privacyVersion, agreedAt: "2026-08-07T00:00:00.000Z" };
}

function defaultState(): E2EConsentState {
  return {
    currentTermsVersion: CURRENT_TERMS_VERSION,
    currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
    record: acceptedRecord(CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION),
    failNextWrite: false,
  };
}

function state() {
  return testGlobal.__jobHubConsent ??= defaultState();
}

export function setE2EConsentScenario(scenario: E2EConsentScenario) {
  assertE2E();
  const next = defaultState();
  if (scenario === "missing" || scenario === "write_failure") next.record = null;
  if (scenario === "write_failure") next.failNextWrite = true;
  if (scenario === "version_changed") {
    next.currentTermsVersion = `${CURRENT_TERMS_VERSION}-next`;
    next.currentPrivacyVersion = `${CURRENT_PRIVACY_VERSION}-next`;
  }
  testGlobal.__jobHubConsent = next;
}

export function getE2EConsentState() {
  assertE2E();
  const value = state();
  return {
    currentTermsVersion: value.currentTermsVersion,
    currentPrivacyVersion: value.currentPrivacyVersion,
    record: value.record ? { ...value.record } : null,
  };
}

export function saveE2EConsent() {
  assertE2E();
  const value = state();
  if (value.failNextWrite) {
    value.failNextWrite = false;
    return false;
  }
  value.record = acceptedRecord(value.currentTermsVersion, value.currentPrivacyVersion);
  return true;
}
