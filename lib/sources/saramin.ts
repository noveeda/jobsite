import { SourceError, type SourceReference, type SourceResult } from "./connector";
import { resolveSaraminActivation } from "./activation";
import {
  ProviderAdapterError,
  type FieldProvenanceEntry,
  type NormalizedJobCandidate,
  type FetchPageInput,
  type ProviderAdapter,
  type ProviderConfiguration,
  type ProviderPage,
  type SourcePostingInput,
} from "./provider-adapter";

type SaraminFixture = { id?: string; title?: string; company?: string; url?: string; location?: string; deadline?: string };
type SaraminNamedValue = { code?: unknown; name?: unknown };

export type SaraminCatalogRecord = {
  id?: unknown;
  url?: unknown;
  active?: unknown;
  company?: { detail?: { href?: unknown; name?: unknown } };
  position?: {
    title?: unknown;
    industry?: SaraminNamedValue;
    location?: SaraminNamedValue;
    "job-type"?: SaraminNamedValue;
    "job-mid-code"?: SaraminNamedValue;
    "job-code"?: SaraminNamedValue;
    "experience-level"?: SaraminNamedValue & { min?: unknown; max?: unknown };
    "required-education-level"?: SaraminNamedValue;
  };
  salary?: SaraminNamedValue;
  "posting-timestamp"?: unknown;
  "modification-timestamp"?: unknown;
  "opening-timestamp"?: unknown;
  "expiration-timestamp"?: unknown;
  "close-type"?: SaraminNamedValue;
};

type SaraminCatalogResponse = {
  code?: unknown;
  message?: unknown;
  jobs?: { count?: unknown; start?: unknown; total?: unknown; job?: unknown };
  result?: { code?: unknown };
};

const SARAMIN_ENDPOINT = "https://oapi.saramin.co.kr/job-search";
const SARAMIN_PAGE_SIZE = 110;
const SARAMIN_TIMEOUT_MS = 8_000;
const allowedSourceFields = [
  "title",
  "companyName",
  "companyUrl",
  "locations",
  "roleName",
  "jobCategories",
  "employmentTypes",
  "experienceText",
  "educationText",
  "industry",
  "salaryText",
  "postedAt",
  "modifiedAt",
  "openedAt",
  "expiresAt",
  "closeType",
] as const;

export function createDailyBudget(limit: number) {
  let date = "";
  let count = 0;
  return {
    consume(now: Date) {
      const nextDate = now.toISOString().slice(0, 10);
      if (nextDate !== date) {
        date = nextDate;
        count = 0;
      }
      if (count >= limit) return false;
      count += 1;
      return true;
    },
  };
}

const dailyBudget = createDailyBudget(500);

export function normalizeSaraminPayload(payload: SaraminFixture): SourceResult {
  if (!payload.id || !payload.title || !payload.company || !payload.url) throw new SourceError("SOURCE_RESPONSE_INVALID");
  const observedAt = new Date().toISOString();
  return {
    provider: "saramin",
    externalId: payload.id,
    originalUrl: payload.url,
    observedAt,
    status: "active",
    values: {
      title: payload.title,
      companyName: payload.company,
      locations: payload.location ? [payload.location] : [],
      deadlineAt: payload.deadline,
      deadlineKind: payload.deadline ? "fixed" : "unknown",
    },
    provenance: Object.fromEntries(["title", "companyName", "locations"].map((key) => [key, { origin: "source" as const, observedAt }])),
  };
}

export async function previewSaramin(reference: SourceReference, fetcher: typeof fetch = fetch): Promise<SourceResult> {
  const key = process.env.SARAMIN_API_KEY;
  if (!key || !reference.externalId) throw new SourceError("CONNECTOR_DISABLED");
  if (!dailyBudget.consume(new Date())) throw new SourceError("SOURCE_RATE_LIMITED");
  const url = new URL(SARAMIN_ENDPOINT);
  url.searchParams.set("access-key", key);
  url.searchParams.set("id", reference.externalId);
  const response = await fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(SARAMIN_TIMEOUT_MS) });
  if (!response.ok) throw new SourceError("SOURCE_UNAVAILABLE");
  return normalizeSaraminPayload(await response.json() as SaraminFixture);
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function utcFromUnix(value: unknown): string | undefined {
  const seconds = nonNegativeInteger(value);
  if (seconds === undefined) return undefined;
  const date = new Date(seconds * 1_000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function safeSaraminUrl(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.username || url.password) return undefined;
    if (url.hostname !== "saramin.co.kr" && !url.hostname.endsWith(".saramin.co.kr")) return undefined;
    for (const key of url.searchParams.keys()) {
      if (/access[-_]?key|secret|token|password/i.test(key)) return undefined;
    }
    url.protocol = "https:";
    return url.toString();
  } catch {
    return undefined;
  }
}

function cursorPage(cursor: string | null): number {
  if (cursor === null) return 0;
  const match = /^saramin-page:(0|[1-9]\d*)$/.exec(cursor);
  const page = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(page)) throw new ProviderAdapterError({ code: "SOURCE_REQUEST_INVALID" });
  return page;
}

function retryAfterMs(response: Response): number {
  const value = response.headers.get("retry-after");
  if (!value) return 60_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1_000, Math.ceil(seconds * 1_000));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(1_000, at - Date.now()) : 60_000;
}

function configuration(): ProviderConfiguration {
  return {
    code: "saramin",
    enabled: false,
    capabilities: { incremental: true, completeSnapshot: true, explicitClose: false, cursor: "page-number" },
    compliance: {
      approvalStatus: "pending",
      termsUrl: "https://oapi.saramin.co.kr/guide/job-search",
      attribution: { text: "Powered by 취업 사람인", href: "https://www.saramin.co.kr" },
      callLimits: { daily: 500, scheduled: 400, reserve: 100, pageSize: SARAMIN_PAGE_SIZE },
      retentionPolicy: { allowedSourceFields, retentionDays: null, purgeOnDisable: true },
      monetizationRestrictions: ["commercial-use-requires-provider-confirmation"],
    },
  };
}

function responseError(code: unknown): ProviderAdapterError {
  switch (String(code)) {
    case "1":
    case "2":
      return new ProviderAdapterError({ code: "SOURCE_AUTH_INVALID" });
    case "3":
      return new ProviderAdapterError({ code: "SOURCE_REQUEST_INVALID" });
    case "4":
      return new ProviderAdapterError({ code: "SOURCE_RATE_LIMITED", retry: { strategy: "after", retryAfterMs: 60_000 } });
    default:
      return new ProviderAdapterError({ code: "SOURCE_UNAVAILABLE" });
  }
}

function normalizeCatalogRecord(record: SaraminCatalogRecord, fetchedAt: string): SourcePostingInput {
  const externalId = text(record.id);
  const originalUrl = safeSaraminUrl(record.url);
  const title = text(record.position?.title);
  const companyName = text(record.company?.detail?.name);
  const active = text(record.active);
  if (!externalId || !originalUrl || !title || !companyName || (active !== "0" && active !== "1")) {
    throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
  }

  const named = (value: SaraminNamedValue | undefined) => {
    const name = text(value?.name);
    const code = text(value?.code);
    return name ? { ...(code ? { code } : {}), label: name } : undefined;
  };
  const location = named(record.position?.location);
  const category = named(record.position?.["job-code"]);
  const companyUrl = safeSaraminUrl(record.company?.detail?.href);
  const roleName = text(record.position?.["job-mid-code"]?.name);
  const employmentType = text(record.position?.["job-type"]?.name);
  const experience = record.position?.["experience-level"];
  const careerMinYears = nonNegativeInteger(experience?.min);
  const careerMaxYears = nonNegativeInteger(experience?.max);
  const experienceText = text(experience?.name);
  const educationText = text(record.position?.["required-education-level"]?.name);
  const industry = text(record.position?.industry?.name);
  const salaryText = text(record.salary?.name);
  const postedAt = utcFromUnix(record["posting-timestamp"]);
  const modifiedAt = utcFromUnix(record["modification-timestamp"]);
  const openedAt = utcFromUnix(record["opening-timestamp"]);
  const closeType = named(record["close-type"]);
  const closeCode = text(record["close-type"]?.code);
  const expiresAt = utcFromUnix(record["expiration-timestamp"]);
  const deadlineKind: NonNullable<NormalizedJobCandidate["deadlineKind"]> = closeCode === "2"
    ? "until_hired"
    : closeCode === "3" || closeCode === "4"
      ? "rolling"
      : closeCode === "1" || expiresAt
        ? "fixed"
        : "unknown";

  const normalized: NormalizedJobCandidate = {
    title,
    companyName,
    ...(companyUrl ? { companyUrl } : {}),
    ...(roleName ? { roleName } : {}),
    ...(location ? { locations: [location] } : {}),
    ...(employmentType ? { employmentTypes: [employmentType] } : {}),
    ...(careerMinYears !== undefined ? { careerMinYears } : {}),
    ...(careerMaxYears !== undefined ? { careerMaxYears } : {}),
    ...(experienceText ? { experienceText } : {}),
    ...(educationText ? { educationText } : {}),
    ...(industry ? { industry } : {}),
    ...(category ? { jobCategories: [category] } : {}),
    ...(salaryText ? { salaryText } : {}),
    ...(postedAt ? { postedAt } : {}),
    ...(modifiedAt ? { modifiedAt } : {}),
    ...(openedAt ? { openedAt } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    deadlineKind,
  };
  const sourcePosting = { providerCode: "saramin", externalId };
  const provenance = (origin: FieldProvenanceEntry["origin"]): FieldProvenanceEntry => ({ sourcePosting, origin, observedAt: fetchedAt });
  const fieldProvenance = Object.fromEntries(Object.keys(normalized).map((key) => [key, provenance(
    key === "deadlineKind" || key === "careerMinYears" || key === "careerMaxYears" ? "normalized" : "source",
  )]));
  const sourceFacts: Readonly<Record<string, unknown>> = {
    ...normalized,
    ...(closeType ? { closeType } : {}),
  };
  const sourceValues = Object.fromEntries(allowedSourceFields.flatMap((key) => (
    sourceFacts[key] === undefined ? [] : [[key, sourceFacts[key]]]
  )));

  return {
    providerCode: "saramin",
    externalId,
    originalUrl,
    sourceStatus: active === "0" ? "closed" : "active",
    fetchedAt,
    sourceValues,
    normalized,
    fieldProvenance,
  };
}

export function parseSaraminCatalogPage(
  payload: unknown,
  input: Pick<FetchPageInput, "cursor" | "runKind">,
): Omit<ProviderPage<SaraminCatalogRecord>, "fetchedAt"> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
  }
  const response = payload as SaraminCatalogResponse;
  if (response.code !== undefined || response.message !== undefined) throw responseError(response.code);
  if (response.result) throw responseError(response.result.code);
  if (!response.jobs || typeof response.jobs !== "object") {
    throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
  }

  const page = cursorPage(input.cursor);
  const rawItems = response.jobs.job;
  const items = Array.isArray(rawItems) ? rawItems : rawItems && typeof rawItems === "object" ? [rawItems] : [];
  const total = nonNegativeInteger(response.jobs.total);
  const count = nonNegativeInteger(response.jobs.count);
  const start = nonNegativeInteger(response.jobs.start);
  if (total === undefined || count === undefined || start !== page || count !== items.length) {
    throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
  }
  const nextCursor = (page + 1) * SARAMIN_PAGE_SIZE < total ? `saramin-page:${page + 1}` : null;
  return {
    items: items as SaraminCatalogRecord[],
    nextCursor,
    total,
    snapshotComplete: input.runKind === "reconciliation" && nextCursor === null,
    quotaCost: 1,
  };
}

export function createSaraminCatalogAdapter(
  fetcher: typeof fetch = fetch,
  resolveActivation: typeof resolveSaraminActivation = resolveSaraminActivation,
): ProviderAdapter<SaraminCatalogRecord> {
  const providerConfiguration = configuration();
  return {
    configuration: providerConfiguration,
    async fetchPage(input) {
      const activation = await resolveActivation();
      const key = process.env.SARAMIN_API_KEY;
      if (!activation.enabled || !key) throw new ProviderAdapterError({ code: "CONNECTOR_DISABLED" });
      if (input.signal.aborted) throw new ProviderAdapterError({ code: "SOURCE_TIMEOUT" });
      const page = cursorPage(input.cursor);
      const url = new URL(SARAMIN_ENDPOINT);
      url.searchParams.set("access-key", key);
      url.searchParams.set("count", String(SARAMIN_PAGE_SIZE));
      url.searchParams.set("start", String(page));
      url.searchParams.set("sort", "ud");
      url.searchParams.set("fields", "posting-date expiration-date");
      if (input.scope.roleCodes.length) url.searchParams.set("job_cd", input.scope.roleCodes.join(","));
      if (input.scope.locationCodes.length) url.searchParams.set("loc_cd", input.scope.locationCodes.join(","));
      if (input.runKind === "incremental" && input.changedSince) {
        const changedAt = Date.parse(input.changedSince);
        if (!Number.isFinite(changedAt)) throw new ProviderAdapterError({ code: "SOURCE_REQUEST_INVALID" });
        url.searchParams.set("updated_min", String(Math.floor(changedAt / 1_000)));
      }

      let response: Response;
      const timeoutSignal = AbortSignal.timeout(SARAMIN_TIMEOUT_MS);
      try {
        response = await fetcher(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.any([input.signal, timeoutSignal]),
        });
      } catch {
        throw new ProviderAdapterError({ code: input.signal.aborted || timeoutSignal.aborted ? "SOURCE_TIMEOUT" : "SOURCE_UNAVAILABLE" });
      }

      if (response.status === 401 || response.status === 403) throw new ProviderAdapterError({ code: "SOURCE_AUTH_INVALID" });
      if (response.status === 408) throw new ProviderAdapterError({ code: "SOURCE_TIMEOUT" });
      if (response.status === 429) {
        throw new ProviderAdapterError({ code: "SOURCE_RATE_LIMITED", retry: { strategy: "after", retryAfterMs: retryAfterMs(response) } });
      }
      if (!response.ok) {
        throw new ProviderAdapterError({ code: response.status >= 400 && response.status < 500 ? "SOURCE_REQUEST_INVALID" : "SOURCE_UNAVAILABLE" });
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
      }
      return { ...parseSaraminCatalogPage(payload, input), fetchedAt: new Date().toISOString() };
    },
    normalize: normalizeCatalogRecord,
  };
}

export const saraminCatalogAdapter = createSaraminCatalogAdapter();
