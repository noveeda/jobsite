import { z } from "zod";

const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:");

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

export const catalogFeedItemSchema = z.object({
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
  lifecycleStatus: z.enum(["active", "stale"]),
  lastObservedAt: z.string().datetime({ offset: true }),
  sources: z.array(catalogSourceSchema).min(1),
}).strict();

export const catalogJobDetailSchema = catalogFeedItemSchema.nullable();

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
export type CatalogFeedResponse = z.infer<typeof catalogFeedResponseSchema>;

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
