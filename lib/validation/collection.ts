import { z } from "zod";

import type {
  FetchPageInput,
  ProviderConfiguration,
  ProviderPage,
} from "@/lib/sources/provider-adapter";

const providerCodeSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const boundedCodeList = z.array(z.string().trim().min(1).max(100)).max(100);
const utcTimestampSchema = z.iso.datetime().refine((value) => value.endsWith("Z"), "UTC timestamp required");

const sensitiveKeys = new Set([
  "accesskey",
  "accesstoken",
  "apikey",
  "authorization",
  "clientsecret",
  "credential",
  "credentials",
  "oauthtoken",
  "password",
  "privatekey",
  "refreshtoken",
  "secret",
  "token",
]);

const rawPayloadKeys = new Set([
  "payload",
  "providerpayload",
  "rawpayload",
  "rawrequest",
  "rawresponse",
  "requestbody",
  "responsebody",
]);

const sensitiveAssignment = /\b(?:access[-_]?key|access[-_]?token|api[-_]?key|authorization|client[-_]?secret|credentials?|oauth[-_]?token|password|private[-_]?key|refresh[-_]?token|secret|token)\b["']?\s*[:=]\s*\S/i;

function isSensitiveKey(key: string) {
  return sensitiveKeys.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase());
}

function isRawPayloadKey(key: string) {
  return rawPayloadKeys.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase());
}

function unsafeUrlReason(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return "Credentials are forbidden in URLs";
  if ([...url.searchParams.keys()].some(isSensitiveKey)) return "Sensitive query parameters are forbidden in URLs";
  return null;
}

const httpsUrlSchema = z.url().max(2048).superRefine((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "https:") context.addIssue({ code: "custom", message: "HTTPS URL required" });
  const reason = unsafeUrlReason(value);
  if (reason) context.addIssue({ code: "custom", message: reason });
});

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]));

function unsafeStoredValueReason(value: JsonValue): string | null {
  if (typeof value === "string") {
    if (/\bBearer\s+\S+/i.test(value) || sensitiveAssignment.test(value)) return "Sensitive scalar value is forbidden";
    return unsafeUrlReason(value);
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const reason = unsafeStoredValueReason(child);
      if (reason) return reason;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (isSensitiveKey(key)) return `Sensitive source field is forbidden: ${key}`;
      if (isRawPayloadKey(key)) return `Raw payload source field is forbidden: ${key}`;
      const reason = unsafeStoredValueReason(child);
      if (reason) return reason;
    }
  }
  return null;
}

const providerCapabilitiesSchema = z.object({
  incremental: z.boolean(),
  completeSnapshot: z.boolean(),
  explicitClose: z.boolean(),
  cursor: z.enum(["none", "page-number", "opaque-token"]),
}).strict();

const callLimitsSchema = z.object({
  daily: z.number().int().positive().nullable(),
  scheduled: z.number().int().nonnegative().nullable(),
  reserve: z.number().int().nonnegative().nullable(),
  pageSize: z.number().int().positive().nullable(),
}).strict().superRefine((limits, context) => {
  if (limits.daily !== null && (limits.scheduled ?? 0) + (limits.reserve ?? 0) > limits.daily) {
    context.addIssue({ code: "custom", path: ["scheduled"], message: "Scheduled and reserve calls exceed the daily limit" });
  }
});

const providerComplianceSchema = z.object({
  approvalStatus: z.enum(["pending", "approved", "blocked", "withdrawn"]),
  termsUrl: httpsUrlSchema,
  attribution: z.object({
    text: z.string().trim().min(1).max(200),
    href: httpsUrlSchema,
  }).strict(),
  callLimits: callLimitsSchema,
  retentionPolicy: z.object({
    allowedSourceFields: boundedCodeList,
    retentionDays: z.number().int().positive().nullable(),
    purgeOnDisable: z.boolean(),
  }).strict(),
  monetizationRestrictions: z.array(z.string().trim().min(1).max(500)).max(20),
}).strict();

export const providerConfigurationSchema: z.ZodType<ProviderConfiguration> = z.object({
  code: providerCodeSchema,
  capabilities: providerCapabilitiesSchema,
  compliance: providerComplianceSchema,
  enabled: z.boolean(),
}).strict().superRefine((configuration, context) => {
  if (configuration.enabled && configuration.compliance.approvalStatus !== "approved") {
    context.addIssue({ code: "custom", path: ["enabled"], message: "Only approved providers can be enabled" });
  }
  if (configuration.code === "saramin") {
    const expected = { daily: 500, scheduled: 400, reserve: 100, pageSize: 110 } as const;
    for (const [name, value] of Object.entries(expected)) {
      if (configuration.compliance.callLimits[name as keyof typeof expected] !== value) {
        context.addIssue({ code: "custom", path: ["compliance", "callLimits", name], message: `Saramin ${name} must be ${value}` });
      }
    }
  }
  for (const field of configuration.compliance.retentionPolicy.allowedSourceFields) {
    if (isSensitiveKey(field) || isRawPayloadKey(field)) {
      context.addIssue({ code: "custom", path: ["compliance", "retentionPolicy", "allowedSourceFields"], message: "Sensitive and raw payload fields cannot be retained" });
    }
  }
});

const collectionScopeSchema = z.object({
  roleCodes: boundedCodeList,
  locationCodes: boundedCodeList,
}).strict();

export const collectionRequestSchema: z.ZodType<FetchPageInput> = z.object({
  cursor: z.string().max(2048).nullable(),
  runKind: z.enum(["incremental", "reconciliation"]),
  changedSince: utcTimestampSchema.nullable(),
  scope: collectionScopeSchema,
  runId: z.uuid(),
  signal: z.custom<AbortSignal>((value) => typeof AbortSignal !== "undefined" && value instanceof AbortSignal),
}).strict();

export const providerPageSchema: z.ZodType<ProviderPage<unknown>> = z.object({
  items: z.array(z.unknown()).max(1_000),
  nextCursor: z.string().max(2048).nullable(),
  total: z.number().int().nonnegative().nullable(),
  snapshotComplete: z.boolean(),
  quotaCost: z.literal(1),
  fetchedAt: utcTimestampSchema,
}).strict();

const normalizedCandidateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  companyName: z.string().trim().min(1).max(200),
  companyUrl: httpsUrlSchema.optional(),
  roleName: z.string().trim().min(1).max(200).optional(),
  locations: z.array(z.object({ code: z.string().trim().min(1).max(100).optional(), label: z.string().trim().min(1).max(200) }).strict()).max(100).optional(),
  employmentTypes: boundedCodeList.optional(),
  careerMinYears: z.number().int().min(0).max(80).optional(),
  careerMaxYears: z.number().int().min(0).max(80).optional(),
  experienceText: z.string().trim().min(1).max(500).optional(),
  educationText: z.string().trim().min(1).max(200).optional(),
  industry: z.string().trim().min(1).max(200).optional(),
  jobCategories: z.array(z.object({ code: z.string().trim().min(1).max(100).optional(), label: z.string().trim().min(1).max(200) }).strict()).max(100).optional(),
  salaryText: z.string().trim().min(1).max(200).optional(),
  postedAt: utcTimestampSchema.optional(),
  modifiedAt: utcTimestampSchema.optional(),
  openedAt: utcTimestampSchema.optional(),
  expiresAt: utcTimestampSchema.optional(),
  deadlineKind: z.enum(["fixed", "rolling", "until_hired", "unknown"]).optional(),
}).strict().superRefine((candidate, context) => {
  if (candidate.careerMinYears !== undefined && candidate.careerMaxYears !== undefined && candidate.careerMaxYears < candidate.careerMinYears) {
    context.addIssue({ code: "custom", path: ["careerMaxYears"], message: "Maximum career years cannot be below minimum career years" });
  }
});

const fieldProvenanceEntrySchema = z.object({
  sourcePosting: z.object({ providerCode: providerCodeSchema, externalId: z.string().trim().min(1).max(200) }).strict(),
  origin: z.enum(["source", "normalized"]),
  observedAt: utcTimestampSchema,
}).strict();

const normalizedPostingBaseSchema = z.object({
  providerCode: providerCodeSchema,
  externalId: z.string().trim().min(1).max(200),
  originalUrl: httpsUrlSchema,
  sourceStatus: z.enum(["active", "closed", "withdrawn"]),
  fetchedAt: utcTimestampSchema,
  sourceValues: z.record(z.string(), jsonValueSchema),
  normalized: normalizedCandidateSchema,
  fieldProvenance: z.record(z.string(), fieldProvenanceEntrySchema),
}).strict();

export function createNormalizedPostingSchema(configuration: ProviderConfiguration) {
  const validatedConfiguration = providerConfigurationSchema.parse(configuration);
  const allowedSourceFields = new Set(validatedConfiguration.compliance.retentionPolicy.allowedSourceFields);

  return normalizedPostingBaseSchema.superRefine((posting, context) => {
    if (posting.providerCode !== validatedConfiguration.code) {
      context.addIssue({ code: "custom", path: ["providerCode"], message: "Posting provider does not match its configuration" });
    }

    for (const [key, value] of Object.entries(posting.sourceValues)) {
      if (isSensitiveKey(key)) {
        context.addIssue({ code: "custom", path: ["sourceValues", key], message: "Sensitive source field is forbidden" });
      }
      if (isRawPayloadKey(key)) {
        context.addIssue({ code: "custom", path: ["sourceValues", key], message: "Raw payload source field is forbidden" });
      }
      if (!allowedSourceFields.has(key)) {
        context.addIssue({ code: "custom", path: ["sourceValues", key], message: "Source field is not allowed by retention policy" });
      }
      const reason = unsafeStoredValueReason(value);
      if (reason) context.addIssue({ code: "custom", path: ["sourceValues", key], message: reason });
    }

    for (const [field, value] of Object.entries(posting.normalized)) {
      if (value !== undefined && !posting.fieldProvenance[field]) {
        context.addIssue({ code: "custom", path: ["fieldProvenance", field], message: "Every populated normalized field requires provenance" });
      }
    }

    for (const [field, provenance] of Object.entries(posting.fieldProvenance)) {
      if (provenance.sourcePosting.providerCode !== posting.providerCode || provenance.sourcePosting.externalId !== posting.externalId) {
        context.addIssue({ code: "custom", path: ["fieldProvenance", field, "sourcePosting"], message: "Provenance must reference this source posting" });
      }
    }
  });
}