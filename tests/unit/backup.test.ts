import { describe, expect, it } from "vitest";
import { validateBackupText } from "@/lib/validation/backup";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const validBackup = () => ({
  schemaVersion: 1,
  generatedAt: "2026-08-07T00:00:00.000Z",
  jobs: [{
    id: id("1"),
    title: "개발자",
    companyName: "회사",
    roleName: null,
    summary: null,
    responsibilities: [],
    qualifications: [],
    preferredQualifications: [],
    careerMinYears: null,
    careerMaxYears: null,
    educationText: null,
    employmentTypes: ["정규직"],
    locations: ["서울"],
    salaryText: null,
    skills: ["TypeScript"],
    postedAt: null,
    deadlineAt: null,
    deadlineKind: "unknown",
    applicationStatus: "applied",
    memo: "내 메모",
    nextActionAt: "2026-08-08T00:00:00.000Z",
    duplicateGroupId: null,
    fieldProvenance: { title: { origin: "user" } },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  }],
  sources: [{
    id: id("2"),
    jobId: id("1"),
    provider: "other",
    connectorMode: "manual",
    externalId: null,
    originalUrl: "https://example.com/job/1",
    status: "unknown",
    firstObservedAt: "2026-08-01T00:00:00.000Z",
    lastCheckedAt: null,
    lastSuccessAt: null,
  }],
  duplicatePairs: [],
  revisions: [{
    id: id("3"),
    jobId: id("1"),
    snapshot: { memo: "이전 메모", application_status: "unreviewed" } as Record<string, unknown>,
    changedAt: "2026-08-06T00:00:00.000Z",
    deviceId: id("4"),
    changeKind: "update",
    restoredFromRevisionId: null,
  }],
});

const validBackupV2 = () => ({
  version: 2,
  exportedAt: "2026-08-09T00:00:00.000Z",
  legacy: validBackup(),
  personalStates: [{
    sourceRef: {
      provider: "backup-v2-fixture",
      externalId: "backup-source-1",
      originalUrl: "https://example.com/jobs/backup-source-1",
    },
    displaySnapshot: { title: "개발자", companyName: "회사" },
    saved: true,
    excluded: false,
    applicationStatus: "interviewing",
    memo: "개인 메모",
    nextActionAt: null,
    updatedAt: "2026-08-09T00:00:00.000Z",
  }],
  duplicateDecisions: [{
    leftSourceRef: {
      provider: "backup-v2-fixture",
      externalId: "backup-source-1",
      originalUrl: "https://example.com/jobs/backup-source-1",
    },
    rightSourceRef: {
      provider: "backup-v2-fixture",
      externalId: "backup-source-2",
      originalUrl: "https://example.com/jobs/backup-source-2",
    },
    decision: "merged",
    leftDisplaySnapshot: { title: "개발자", companyName: "회사" },
    rightDisplaySnapshot: { title: "개발자 2", companyName: "회사" },
  }],
  manualLinks: [{
    legacyJobId: id("1"),
    sourceRef: {
      provider: "backup-v2-fixture",
      externalId: "backup-source-1",
      originalUrl: "https://example.com/jobs/backup-source-1",
    },
  }],
});

describe("versioned backup validation", () => {
  it("accepts the v1 contract", () => {
    expect(validateBackupText(JSON.stringify(validBackup())).success).toBe(true);
  });

  it("accepts the closed v2 envelope without reinterpreting v1 legacy statuses", () => {
    const value = validBackupV2();
    value.legacy.jobs[0].applicationStatus = "accepted";
    expect(validateBackupText(JSON.stringify(value))).toMatchObject({ success: true, data: { version: 2 } });
  });

  it("rejects legacy-only status values and hostile nested v2 keys", () => {
    const legacyStatus = validBackupV2();
    legacyStatus.personalStates[0].applicationStatus = "accepted";
    expect(validateBackupText(JSON.stringify(legacyStatus)).success).toBe(false);

    const hostile = validBackupV2();
    hostile.duplicateDecisions[0].leftDisplaySnapshot = { title: "개발자", apiKey: "must-not-export" } as never;
    expect(validateBackupText(JSON.stringify(hostile)).success).toBe(false);
  });

  it("rejects duplicate portable references and oversized v2 memos", () => {
    const duplicate = validBackupV2();
    duplicate.personalStates.push(structuredClone(duplicate.personalStates[0]));
    expect(validateBackupText(JSON.stringify(duplicate)).success).toBe(false);

    const oversized = validBackupV2();
    oversized.personalStates[0].memo = "x".repeat(10_001);
    expect(validateBackupText(JSON.stringify(oversized)).success).toBe(false);
  });

  it("rejects target-local IDs and unsafe portable URLs from v2 overlays", () => {
    const localId = validBackupV2();
    (localId.duplicateDecisions[0] as Record<string, unknown>).candidateId = id("999");
    expect(validateBackupText(JSON.stringify(localId)).success).toBe(false);

    const unsafeUrl = validBackupV2();
    unsafeUrl.manualLinks[0].sourceRef.originalUrl = "https://user:password@example.com/private";
    expect(validateBackupText(JSON.stringify(unsafeUrl)).success).toBe(false);
  });

  it("rejects files larger than 10 MiB before parsing", () => {
    const result = validateBackupText(" ".repeat(10 * 1024 * 1024 + 1));
    expect(result).toMatchObject({ success: false, code: "BACKUP_TOO_LARGE" });
  });

  it("rejects broken references, duplicate IDs, and invalid enums", () => {
    const value = validBackup();
    value.sources[0].jobId = id("999");
    value.jobs.push({ ...value.jobs[0], deadlineKind: "forever" as "unknown" });
    const result = validateBackupText(JSON.stringify(value));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join(" ")).toMatch(/참조|중복|deadlineKind/);
  });

  it.each(["__proto__", "constructor", "token", "apiKey", "rawBody", "fullBody"])("rejects hostile or secret field %s", (field) => {
    const value = validBackup();
    value.revisions[0].snapshot = { [field]: "do-not-import" };
    expect(validateBackupText(JSON.stringify(value)).success).toBe(false);
  });

  it("rejects user IDs and unknown top-level secret fields", () => {
    const value = { ...validBackup(), userId: id("55"), accessToken: "secret" };
    expect(validateBackupText(JSON.stringify(value)).success).toBe(false);
  });

  it("bounds validation output to twenty short errors", () => {
    const value = validBackup();
    value.jobs = Array.from({ length: 50 }, (_, index) => ({ ...value.jobs[0], id: `bad-${index}`, title: "" }));
    const result = validateBackupText(JSON.stringify(value));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeLessThanOrEqual(20);
      expect(result.errors.every((message) => message.length <= 200)).toBe(true);
    }
  });
});
