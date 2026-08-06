import type { BackupV1 } from "@/lib/validation/backup";

const job = (id: string, title: string): BackupV1["jobs"][number] => ({
  id,
  title,
  companyName: "백업 회사",
  roleName: "백엔드",
  summary: "저장된 요약",
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
  memo: "백업 메모",
  nextActionAt: "2026-08-08T00:00:00.000Z",
  duplicateGroupId: null,
  fieldProvenance: { title: { origin: "user" } },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-07T00:00:00.000Z",
});

function fixture(): BackupV1 {
  const left = "10000000-0000-4000-8000-000000000001";
  const right = "10000000-0000-4000-8000-000000000002";
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    jobs: [job(left, "백업 개발자"), job(right, "백업 개발자 중복")],
    sources: [{
      id: "20000000-0000-4000-8000-000000000001",
      jobId: left,
      provider: "other",
      connectorMode: "manual",
      externalId: null,
      originalUrl: "https://example.com/job/backup",
      status: "unknown",
      firstObservedAt: "2026-08-01T00:00:00.000Z",
      lastCheckedAt: null,
      lastSuccessAt: null,
    }],
    duplicatePairs: [{
      id: "30000000-0000-4000-8000-000000000001",
      leftJobId: left,
      rightJobId: right,
      score: 0.9,
      reasons: { company: true },
      decision: "confirmed",
      decidedAt: "2026-08-06T00:00:00.000Z",
      createdAt: "2026-08-05T00:00:00.000Z",
    }],
    revisions: [{
      id: "40000000-0000-4000-8000-000000000001",
      jobId: left,
      snapshot: { memo: "이전 메모", application_status: "unreviewed" },
      changedAt: "2026-08-06T00:00:00.000Z",
      deviceId: "50000000-0000-4000-8000-000000000001",
      changeKind: "update",
      restoredFromRevisionId: null,
    }],
  };
}

const globalStore = globalThis as typeof globalThis & { __jobHubBackup?: BackupV1 };
export function getE2EBackup() {
  globalStore.__jobHubBackup ??= fixture();
  return structuredClone(globalStore.__jobHubBackup);
}
export function setE2EBackup(backup: BackupV1) {
  globalStore.__jobHubBackup = structuredClone(backup);
}