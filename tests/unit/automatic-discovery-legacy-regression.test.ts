import { afterEach, describe, expect, it, vi } from "vitest";

import { validateServerEnvironment } from "@/lib/environment";
import { ACCOUNT_DELETION_CONFIRMATION, isExactAccountDeletionConfirmation } from "@/lib/legal/policy";
import { recognizeSource, refreshSource, type RefreshSourceInput } from "@/lib/sources/connector";
import { validateBackupText } from "@/lib/validation/backup";
import { jobInputSchema } from "@/lib/validation/jobs";

const originalSaraminFlag = process.env.SARAMIN_CONNECTOR_ENABLED;
const jobId = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";
const observedAt = "2026-08-08T00:00:00.000Z";
const originalUrl = "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123";

afterEach(() => {
  if (originalSaraminFlag === undefined) delete process.env.SARAMIN_CONNECTOR_ENABLED;
  else process.env.SARAMIN_CONNECTOR_ENABLED = originalSaraminFlag;
});

describe("automatic discovery legacy regression", () => {
  it("defaults discovery off and keeps manual job input available", () => {
    const environment = validateServerEnvironment({
      NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    });
    expect(environment).toMatchObject({ automaticDiscoveryEnabled: false, collectorEnabled: false });

    const manualJob = jobInputSchema.parse({
      title: "백엔드 개발자",
      companyName: "예시 회사",
      originalUrl,
      deadlineKind: "unknown",
    });
    expect(manualJob).toMatchObject({ title: "백엔드 개발자", companyName: "예시 회사", originalUrl });
  });

  it("keeps the v1 manual-job backup contract accepted for restore", () => {
    const backup = {
      schemaVersion: 1,
      generatedAt: observedAt,
      jobs: [{
        id: jobId,
        title: "백엔드 개발자",
        companyName: "예시 회사",
        deadlineKind: "unknown",
        applicationStatus: "applied",
        memo: "지원 완료",
        fieldProvenance: { title: { origin: "user" } },
        createdAt: observedAt,
        updatedAt: observedAt,
      }],
      sources: [{
        id: sourceId,
        jobId,
        provider: "saramin",
        connectorMode: "manual",
        externalId: "123",
        originalUrl,
        status: "unknown",
        firstObservedAt: observedAt,
      }],
      duplicatePairs: [],
      revisions: [],
    };

    const result = validateBackupText(JSON.stringify(backup));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        schemaVersion: 1,
        jobs: [{ id: jobId, memo: "지원 완료", applicationStatus: "applied" }],
        sources: [{ id: sourceId, jobId, connectorMode: "manual" }],
      });
    }
  });

  it("keeps the exact account-deletion confirmation contract", () => {
    expect(ACCOUNT_DELETION_CONFIRMATION).toBe("회원탈퇴");
    expect(isExactAccountDeletionConfirmation("회원탈퇴")).toBe(true);
    expect(isExactAccountDeletionConfirmation(" 회원탈퇴 ")).toBe(false);
  });

  it("keeps disabled Saramin references on the provider-free manual refresh path", async () => {
    delete process.env.SARAMIN_CONNECTOR_ENABLED;
    const reference = recognizeSource(originalUrl);
    expect(reference).toMatchObject({ provider: "saramin", externalId: "123", connectorMode: "manual" });

    const input: RefreshSourceInput = {
      job: {
        title: "사용자 제목",
        companyName: "예시 회사",
        roleName: null,
        locations: [],
        deadlineAt: null,
        deadlineKind: "unknown",
        fieldProvenance: { title: { origin: "user" } },
      },
      source: {
        id: sourceId,
        ...reference,
        status: "unknown",
        lastCheckedAt: null,
        lastSuccessAt: null,
      },
    };
    const providerCall = vi.fn();
    const persist = vi.fn().mockResolvedValue(undefined);
    const result = await refreshSource(input, {
      now: () => new Date(observedAt),
      providerCall,
      persist,
    });

    expect(result).toMatchObject({ status: "unsupported", errorCode: "MANUAL_ONLY", changedFields: [], job: input.job });
    expect(providerCall).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ sourceId, errorCode: "MANUAL_ONLY", jobPatch: {} }));
  });
});
