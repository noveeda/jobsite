import { z } from "zod";

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const MAX_ERRORS = 20;
const uuid = z.uuid();
const isoDate = z.iso.datetime();
const nullableDate = isoDate.nullable().optional();
const hostileKey = /^(?:__proto__|prototype|constructor|token|access_?token|refresh_?token|secret|password|credential|api_?key|raw_?body|full_?body|user_?id)$/i;
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

const provenanceEntry = z.strictObject({
  origin: z.enum(["source", "normalized", "user", "missing", "not_applicable", "failed"]),
  sourceId: uuid.nullable().optional(),
  observedAt: nullableDate,
});

const jobSchema = z.strictObject({
  id: uuid,
  title: z.string().min(1).max(300),
  companyName: z.string().min(1).max(200),
  roleName: z.string().max(200).nullable().optional(),
  summary: z.string().max(1000).nullable().optional(),
  responsibilities: z.array(z.string().max(500)).optional(),
  qualifications: z.array(z.string().max(500)).optional(),
  preferredQualifications: z.array(z.string().max(500)).optional(),
  careerMinYears: z.number().int().min(0).max(80).nullable().optional(),
  careerMaxYears: z.number().int().min(0).max(80).nullable().optional(),
  educationText: z.string().max(100).nullable().optional(),
  employmentTypes: z.array(z.string().max(100)).optional(),
  locations: z.array(z.string().max(200)).optional(),
  salaryText: z.string().max(200).nullable().optional(),
  skills: z.array(z.string().max(100)).optional(),
  postedAt: nullableDate,
  deadlineAt: nullableDate,
  deadlineKind: z.enum(["fixed", "rolling", "until_hired", "unknown"]),
  applicationStatus: z.enum(["unreviewed", "interested", "planned", "applied", "interviewing", "accepted", "rejected", "excluded"]),
  memo: z.string().max(20000).optional(),
  nextActionAt: nullableDate,
  duplicateGroupId: uuid.nullable().optional(),
  fieldProvenance: z.record(z.string(), provenanceEntry),
  createdAt: isoDate,
  updatedAt: isoDate,
}).superRefine((job, context) => {
  if (job.deadlineKind === "fixed" && !job.deadlineAt) {
    context.addIssue({ code: "custom", path: ["deadlineAt"], message: "fixed deadlineKind에는 deadlineAt이 필요합니다." });
  }
  if (job.careerMinYears != null && job.careerMaxYears != null && job.careerMaxYears < job.careerMinYears) {
    context.addIssue({ code: "custom", path: ["careerMaxYears"], message: "careerMaxYears가 최소 경력보다 작습니다." });
  }
});

const sourceSchema = z.strictObject({
  id: uuid,
  jobId: uuid,
  provider: z.enum(["manual", "saramin", "jobkorea", "other"]),
  connectorMode: z.enum(["manual", "approved_api"]),
  externalId: z.string().max(200).nullable().optional(),
  originalUrl: z.url().max(2048).refine((value) => new URL(value).protocol === "https:", "HTTPS URL만 허용됩니다."),
  status: z.enum(["active", "closed", "unreachable", "unsupported", "unknown"]),
  firstObservedAt: isoDate,
  lastCheckedAt: nullableDate,
  lastSuccessAt: nullableDate,
});

const duplicatePairSchema = z.strictObject({
  id: uuid,
  leftJobId: uuid,
  rightJobId: uuid,
  score: z.number().min(0).max(1),
  reasons: z.record(z.string(), jsonValueSchema),
  decision: z.enum(["suggested", "confirmed", "rejected"]),
  decidedAt: nullableDate,
  createdAt: isoDate,
});

const revisionSchema = z.strictObject({
  id: uuid,
  jobId: uuid,
  snapshot: z.record(z.string(), jsonValueSchema),
  changedAt: isoDate,
  deviceId: uuid,
  changeKind: z.enum(["update", "delete", "restore", "import"]),
  restoredFromRevisionId: uuid.nullable().optional(),
});

export const backupSchemaV1 = z.strictObject({
  schemaVersion: z.literal(1),
  generatedAt: isoDate,
  jobs: z.array(jobSchema).max(10000),
  sources: z.array(sourceSchema).max(20000),
  duplicatePairs: z.array(duplicatePairSchema).max(20000),
  revisions: z.array(revisionSchema).max(100000),
}).superRefine((backup, context) => {
  function uniqueIds(items: { id: string }[], path: string) {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) context.addIssue({ code: "custom", path: [path, index, "id"], message: "중복 ID입니다." });
      seen.add(item.id);
    });
  }
  uniqueIds(backup.jobs, "jobs");
  uniqueIds(backup.sources, "sources");
  uniqueIds(backup.duplicatePairs, "duplicatePairs");
  uniqueIds(backup.revisions, "revisions");

  const jobIds = new Set(backup.jobs.map((job) => job.id));
  const sourceIds = new Set(backup.sources.map((source) => source.id));
  const revisionIds = new Set(backup.revisions.map((revision) => revision.id));
  const revisionJobIds = new Set(backup.revisions.map((revision) => revision.jobId));

  backup.sources.forEach((source, index) => {
    if (!jobIds.has(source.jobId)) context.addIssue({ code: "custom", path: ["sources", index, "jobId"], message: "존재하지 않는 공고 참조입니다." });
  });
  backup.duplicatePairs.forEach((pair, index) => {
    if (!jobIds.has(pair.leftJobId) || !jobIds.has(pair.rightJobId) || pair.leftJobId === pair.rightJobId) {
      context.addIssue({ code: "custom", path: ["duplicatePairs", index], message: "유효하지 않은 공고 참조입니다." });
    }
  });
  backup.revisions.forEach((revision, index) => {
    if (!jobIds.has(revision.jobId) && !revisionJobIds.has(revision.jobId)) {
      context.addIssue({ code: "custom", path: ["revisions", index, "jobId"], message: "유효하지 않은 이력 공고 참조입니다." });
    }
    if (revision.restoredFromRevisionId && !revisionIds.has(revision.restoredFromRevisionId)) {
      context.addIssue({ code: "custom", path: ["revisions", index, "restoredFromRevisionId"], message: "유효하지 않은 복구 이력 참조입니다." });
    }
  });
  backup.jobs.forEach((job, jobIndex) => {
    Object.entries(job.fieldProvenance).forEach(([field, entry]) => {
      if (entry.sourceId && !sourceIds.has(entry.sourceId)) {
        context.addIssue({ code: "custom", path: ["jobs", jobIndex, "fieldProvenance", field, "sourceId"], message: "유효하지 않은 출처 참조입니다." });
      }
    });
  });
});

export type BackupV1 = z.infer<typeof backupSchemaV1>;
const sourceRefSchema = z.strictObject({
  provider: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  externalId: z.string().min(1).max(200).refine((value) => value.trim() === value, "앞뒤 공백은 허용되지 않습니다."),
  originalUrl: z.url().max(2048).refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "자격 증명 없는 HTTPS URL만 허용됩니다."),
});

const safeDisplaySchema = z.strictObject({
  title: z.string().max(300).optional(),
  companyName: z.string().max(200).optional(),
  roleName: z.string().max(200).optional(),
  locations: z.array(z.string().max(100)).max(20).optional(),
  postedAt: isoDate.optional(),
  deadlineAt: isoDate.optional(),
});

const catalogApplicationStatus = z.enum(["unreviewed", "planned", "applied", "interviewing", "offered", "rejected", "withdrawn"]);
const sourceReferenceKey = (sourceRef: z.infer<typeof sourceRefSchema>) => `${sourceRef.provider}\u0000${sourceRef.externalId}\u0000${sourceRef.originalUrl}`;

const personalStateSchema = z.strictObject({
  sourceRef: sourceRefSchema,
  displaySnapshot: safeDisplaySchema.optional(),
  saved: z.boolean().optional(),
  excluded: z.boolean().optional(),
  applicationStatus: catalogApplicationStatus.optional(),
  memo: z.string().max(10000).optional(),
  nextActionAt: nullableDate,
  updatedAt: isoDate,
});

const portableDuplicateDecisionSchema = z.strictObject({
  leftSourceRef: sourceRefSchema,
  rightSourceRef: sourceRefSchema,
  decision: z.enum(["merged", "separate"]),
  leftDisplaySnapshot: safeDisplaySchema.optional(),
  rightDisplaySnapshot: safeDisplaySchema.optional(),
  representativeSourceRef: sourceRefSchema.nullable().optional(),
});

const manualLinkSchema = z.strictObject({
  legacyJobId: uuid,
  sourceRef: sourceRefSchema,
});

export const backupSchemaV2 = z.strictObject({
  version: z.literal(2),
  exportedAt: isoDate,
  legacy: backupSchemaV1,
  personalStates: z.array(personalStateSchema).max(20000),
  duplicateDecisions: z.array(portableDuplicateDecisionSchema).max(20000),
  manualLinks: z.array(manualLinkSchema).max(20000),
}).superRefine((backup, context) => {
  const personalStates = new Set<string>();
  backup.personalStates.forEach((state, index) => {
    const key = sourceReferenceKey(state.sourceRef);
    if (personalStates.has(key)) context.addIssue({ code: "custom", path: ["personalStates", index, "sourceRef"], message: "중복 출처 참조입니다." });
    personalStates.add(key);
  });

  const decisions = new Set<string>();
  backup.duplicateDecisions.forEach((decision, index) => {
    const left = sourceReferenceKey(decision.leftSourceRef);
    const right = sourceReferenceKey(decision.rightSourceRef);
    if (left === right) context.addIssue({ code: "custom", path: ["duplicateDecisions", index], message: "중복 결정의 양 끝점은 달라야 합니다." });
    const key = [left, right].sort().join("\u0001");
    if (decisions.has(key)) context.addIssue({ code: "custom", path: ["duplicateDecisions", index], message: "중복 출처 쌍입니다." });
    decisions.add(key);
  });

  const legacyIds = new Set(backup.legacy.jobs.map((job) => job.id));
  const manualJobs = new Set<string>();
  backup.manualLinks.forEach((link, index) => {
    if (!legacyIds.has(link.legacyJobId)) context.addIssue({ code: "custom", path: ["manualLinks", index, "legacyJobId"], message: "legacy에 없는 수동 공고 참조입니다." });
    if (manualJobs.has(link.legacyJobId)) context.addIssue({ code: "custom", path: ["manualLinks", index, "legacyJobId"], message: "수동 공고 연결이 중복되었습니다." });
    manualJobs.add(link.legacyJobId);
  });
});

export type BackupV2 = z.infer<typeof backupSchemaV2>;
export type BackupPayload = BackupV1 | BackupV2;
export type BackupValidation =
  | { success: true; data: BackupPayload }
  | { success: false; code: "BACKUP_TOO_LARGE" | "INVALID_JSON" | "UNSUPPORTED_VERSION" | "INVALID_BACKUP"; errors: string[] };

function dangerousPaths(value: unknown, path = "$", found: string[] = []): string[] {
  if (found.length >= MAX_ERRORS || value === null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => dangerousPaths(item, `${path}[${index}]`, found));
    return found;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (hostileKey.test(key)) found.push(`${path}.${key}: 허용되지 않는 필드입니다.`);
    if (found.length >= MAX_ERRORS) break;
    dangerousPaths(child, `${path}.${key}`, found);
  }
  return found;
}

function bounded(errors: string[]) {
  return errors.slice(0, MAX_ERRORS).map((message) => message.slice(0, 200));
}

export function validateBackupValue(value: unknown): BackupValidation {
  const dangerous = dangerousPaths(value);
  if (dangerous.length) return { success: false, code: "INVALID_BACKUP", errors: bounded(dangerous) };
  if (!value || typeof value !== "object") {
    return { success: false, code: "UNSUPPORTED_VERSION", errors: ["지원하지 않는 백업 버전입니다."] };
  }
  const result = (value as { schemaVersion?: unknown }).schemaVersion === 1
    ? backupSchemaV1.safeParse(value)
    : (value as { version?: unknown }).version === 2
      ? backupSchemaV2.safeParse(value)
      : null;
  if (!result) return { success: false, code: "UNSUPPORTED_VERSION", errors: ["지원하지 않는 백업 버전입니다."] };
  if (!result.success) {
    return {
      success: false,
      code: "INVALID_BACKUP",
      errors: bounded(result.error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`)),
    };
  }
  return { success: true, data: result.data };
}

export function validateBackupText(text: string): BackupValidation {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    return { success: false, code: "BACKUP_TOO_LARGE", errors: ["백업 파일은 10 MiB 이하여야 합니다."] };
  }
  try {
    return validateBackupValue(JSON.parse(text));
  } catch {
    return { success: false, code: "INVALID_JSON", errors: ["유효한 JSON 파일이 아닙니다."] };
  }
}
