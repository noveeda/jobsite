import { z } from "zod";

import { personalApplicationStatusSchema } from "@/lib/validation/personal-job-state";

const httpsUrl = z.string().url().refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === "https:"
    && parsed.hostname.length > 0
    && parsed.username.length === 0
    && parsed.password.length === 0;
}, "Expected a credential-free HTTPS URL");

const catalogSourceSchema = z.object({
  provider: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  providerName: z.string().trim().min(1).max(100),
  originalUrl: httpsUrl,
  lastObservedAt: z.string().datetime({ offset: true }),
  attribution: z.object({ text: z.string().trim().min(1).max(100), href: httpsUrl }).strict(),
}).strict();

export const providerErrorCodeSchema = z.enum([
  "CONNECTOR_DISABLED",
  "SOURCE_AUTH_INVALID",
  "SOURCE_REQUEST_INVALID",
  "SOURCE_RATE_LIMITED",
  "SOURCE_TIMEOUT",
  "SOURCE_UNAVAILABLE",
  "SOURCE_RESPONSE_INVALID",
  "SOURCE_TERMS_BLOCKED",
]);

const catalogDisplayItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  companyName: z.string().trim().min(1).max(300),
  roleName: z.string().nullable(),
  locations: z.array(z.string()),
  employmentTypes: z.array(z.string()),
  careerMinYears: z.number().int().min(0).nullable(),
  careerMaxYears: z.number().int().min(0).nullable(),
  experienceText: z.string().nullable(),
  educationText: z.string().nullable(),
  industry: z.string().nullable(),
  jobCategories: z.array(z.string()),
  salaryText: z.string().nullable(),
  postedAt: z.string().datetime({ offset: true }).nullable(),
  deadlineKind: z.enum(["fixed", "rolling", "until_hired", "unknown"]),
  deadlineAt: z.string().datetime({ offset: true }).nullable(),
  lifecycleStatus: z.enum(["active", "stale", "closed", "withdrawn"]),
  lastObservedAt: z.string().datetime({ offset: true }),
  sources: z.array(catalogSourceSchema).min(1),
}).strict();

export const catalogDuplicateCandidateSchema = z.object({
  leftJobId: z.string().uuid(),
  rightJobId: z.string().uuid(),
  score: z.number().min(0).max(1),
  reasons: z.object({
    companyMatch: z.boolean(),
    titleSimilarity: z.number().min(0).max(1),
    roleMatch: z.boolean(),
    locationMatch: z.boolean(),
    postedWithinDays: z.boolean(),
  }).strict(),
}).strict().superRefine((candidate, context) => {
  if (candidate.leftJobId >= candidate.rightJobId) {
    context.addIssue({
      code: "custom",
      path: ["leftJobId"],
      message: "Candidate job IDs must be a distinct ordered pair",
    });
  }
});

export const catalogPersonalStateSchema = z.object({
  saved: z.boolean(),
  excluded: z.boolean(),
  applicationStatus: personalApplicationStatusSchema,
  nextActionAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const catalogFeedItemSchema = catalogDisplayItemSchema.extend({
  personalState: catalogPersonalStateSchema,
});

export const catalogJobDetailSchema = catalogDisplayItemSchema.extend({
  personalState: catalogPersonalStateSchema.extend({
    memo: z.string().max(10_000),
  }),
}).nullable();

const catalogDuplicateDetailSourceSchema = z.object({
  provider: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  providerName: z.string().trim().min(1).max(100),
  originalUrl: httpsUrl,
  observedAt: z.string().datetime({ offset: true }),
}).strict();

const catalogDuplicateConflictSchema = z.object({
  field: z.enum(["deadlineAt", "locations"]),
  values: z.array(z.object({
    provider: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
    observedAt: z.string().datetime({ offset: true }),
    value: z.string().trim().max(300).nullable(),
  }).strict()).min(2).max(2),
}).strict();

const catalogDuplicateCurrentUserSchema = z.object({
  decision: z.enum(["merged", "separate"]).nullable(),
  revision: z.number().int().min(0),
  history: z.array(z.object({
    action: z.enum(["merge", "separate", "undo"]),
    createdAt: z.string().datetime({ offset: true }),
  }).strict()).max(25),
}).strict();

export const catalogDuplicateDetailSchema = z.object({
  candidates: z.array(z.object({
    id: z.string().uuid(),
    counterpartId: z.string().uuid(),
    score: z.number().min(0).max(1),
    reasons: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,39}$/)).min(1).max(20),
    evidenceRevision: z.number().int().positive(),
    sources: z.array(catalogDuplicateDetailSourceSchema).length(2),
    conflicts: z.array(catalogDuplicateConflictSchema).max(2),
    currentUser: catalogDuplicateCurrentUserSchema,
    group: z.object({
      representativeId: z.string().uuid(),
      memberIds: z.array(z.string().uuid()).min(1).max(25),
    }).strict(),
  }).strict()).max(25),
}).strict();

export const catalogFeedResponseSchema = z.object({
  items: z.array(catalogFeedItemSchema),
  total: z.number().int().min(0),
  missingCounts: z.object({
    region: z.number().int().min(0),
    role: z.number().int().min(0),
    career: z.number().int().min(0),
    employment: z.number().int().min(0),
    deadline: z.number().int().min(0),
    source: z.number().int().min(0),
  }).strict(),
  hasMore: z.boolean(),
  enabledProviderCount: z.number().int().min(0),
  providerHealth: z.array(z.object({
    code: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
    displayName: z.string().trim().min(1).max(100),
    enabled: z.boolean(),
    lastSuccessAt: z.string().datetime({ offset: true }).nullable(),
    errorCode: providerErrorCodeSchema.nullable(),
  }).strict()),
}).strict().superRefine((feed, context) => {
  const codes = new Set(feed.providerHealth.map(({ code }) => code));
  if (codes.size !== feed.providerHealth.length) {
    context.addIssue({ code: "custom", path: ["providerHealth"], message: "Provider codes must be unique" });
  }
  const enabled = feed.providerHealth.filter(({ enabled }) => enabled).length;
  if (enabled !== feed.enabledProviderCount) {
    context.addIssue({ code: "custom", path: ["enabledProviderCount"], message: "Enabled provider count is inconsistent" });
  }
});

export type CatalogFeedItem = z.infer<typeof catalogFeedItemSchema>;
export type CatalogJobDetail = NonNullable<z.infer<typeof catalogJobDetailSchema>>;
export type CatalogDuplicateDetail = z.infer<typeof catalogDuplicateDetailSchema>;
export type CatalogFeedResponse = z.infer<typeof catalogFeedResponseSchema>;
export type CatalogDuplicateCandidate = z.infer<typeof catalogDuplicateCandidateSchema>;

const pageSize = 30;
const maxTake = 1_020;
const safeFilter = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,99}$/u;
const careerFilter = /^(?:entry|experienced|any|\d{1,2}(?:-\d{1,2}|\+)?)$/;

export type FeedQueryInput = Record<string, string | readonly string[] | undefined>;

export type FeedQuery = {
  q?: string;
  region?: string;
  role?: string;
  career?: string;
  employment?: string;
  deadline?: "active" | "closingSoon" | "unknown";
  source?: string;
  sort: "posted" | "deadline";
  includeExcluded: boolean;
  saved: boolean;
  take: number;
};

function scalar(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

function boundedText(value: string | undefined, maximum: number) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized && normalized.length <= maximum ? normalized : undefined;
}

function filterValue(value: string | undefined) {
  const normalized = boundedText(value, 100);
  return normalized && safeFilter.test(normalized) ? normalized : undefined;
}

function takeValue(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return pageSize;
  const parsed = Number(value);
  return parsed >= pageSize && parsed <= maxTake && parsed % pageSize === 0 ? parsed : pageSize;
}

export function parseFeedQuery(input: FeedQueryInput): FeedQuery {
  const deadline = scalar(input.deadline);
  const sort = scalar(input.sort);
  const career = scalar(input.career);

  return {
    ...(boundedText(scalar(input.q), 100) ? { q: boundedText(scalar(input.q), 100) } : {}),
    ...(filterValue(scalar(input.region)) ? { region: filterValue(scalar(input.region)) } : {}),
    ...(filterValue(scalar(input.role)) ? { role: filterValue(scalar(input.role)) } : {}),
    ...(career && careerFilter.test(career) ? { career } : {}),
    ...(filterValue(scalar(input.employment)) ? { employment: filterValue(scalar(input.employment)) } : {}),
    ...(deadline === "active" || deadline === "closingSoon" || deadline === "unknown" ? { deadline } : {}),
    ...(filterValue(scalar(input.source)) ? { source: filterValue(scalar(input.source)) } : {}),
    sort: sort === "deadline" ? "deadline" : "posted",
    includeExcluded: scalar(input.includeExcluded) === "true",
    saved: scalar(input.saved) === "true",
    take: takeValue(scalar(input.take)),
  };
}
