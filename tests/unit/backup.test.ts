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

describe("versioned backup validation", () => {
  it("accepts the v1 contract", () => {
    expect(validateBackupText(JSON.stringify(validBackup())).success).toBe(true);
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