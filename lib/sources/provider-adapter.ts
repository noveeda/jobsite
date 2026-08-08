export type UtcTimestamp = string;
export type OpaqueCursor = string;

export type ProviderCapabilities = {
  incremental: boolean;
  completeSnapshot: boolean;
  explicitClose: boolean;
  cursor: "none" | "page-number" | "opaque-token";
};

export type ProviderCompliance = {
  approvalStatus: "pending" | "approved" | "blocked" | "withdrawn";
  termsUrl: string;
  attribution: { text: string; href: string };
  callLimits: {
    daily: number | null;
    scheduled: number | null;
    reserve: number | null;
    pageSize: number | null;
  };
  retentionPolicy: {
    allowedSourceFields: readonly string[];
    retentionDays: number | null;
    purgeOnDisable: boolean;
  };
  monetizationRestrictions: readonly string[];
};

export type ProviderConfiguration = {
  code: string;
  capabilities: ProviderCapabilities;
  compliance: ProviderCompliance;
  enabled: boolean;
};

export type CollectionScope = {
  roleCodes: readonly string[];
  locationCodes: readonly string[];
};

export type FetchPageInput = {
  cursor: OpaqueCursor | null;
  runKind: "incremental" | "reconciliation";
  changedSince: UtcTimestamp | null;
  scope: CollectionScope;
  runId: string;
  signal: AbortSignal;
};

export type ProviderPage<TRecord> = {
  items: readonly TRecord[];
  nextCursor: OpaqueCursor | null;
  total: number | null;
  snapshotComplete: boolean;
  quotaCost: number;
  fetchedAt: UtcTimestamp;
};

export type SourceStatus = "active" | "closed" | "withdrawn";
export type DeadlineKind = "fixed" | "rolling" | "until_hired" | "unknown";

export type NormalizedJobCandidate = {
  title: string;
  companyName: string;
  companyUrl?: string;
  roleName?: string;
  locations?: readonly { code?: string; label: string }[];
  employmentTypes?: readonly string[];
  careerMinYears?: number;
  careerMaxYears?: number;
  experienceText?: string;
  educationText?: string;
  industry?: string;
  jobCategories?: readonly { code?: string; label: string }[];
  salaryText?: string;
  postedAt?: UtcTimestamp;
  modifiedAt?: UtcTimestamp;
  openedAt?: UtcTimestamp;
  expiresAt?: UtcTimestamp;
  deadlineKind?: DeadlineKind;
};

export type FieldProvenanceEntry = {
  sourcePosting: { providerCode: string; externalId: string };
  origin: "source" | "normalized";
  observedAt: UtcTimestamp;
};

export type SourcePostingInput = {
  providerCode: string;
  externalId: string;
  originalUrl: string;
  sourceStatus: SourceStatus;
  fetchedAt: UtcTimestamp;
  sourceValues: Readonly<Record<string, unknown>>;
  normalized: NormalizedJobCandidate;
  fieldProvenance: Readonly<Record<string, FieldProvenanceEntry>>;
};

export type ProviderAdapter<TRecord> = {
  configuration: ProviderConfiguration;
  fetchPage(input: FetchPageInput): Promise<ProviderPage<TRecord>>;
  normalize(record: TRecord, fetchedAt: UtcTimestamp): SourcePostingInput;
};

export type ProviderErrorCode =
  | "CONNECTOR_DISABLED"
  | "SOURCE_AUTH_INVALID"
  | "SOURCE_REQUEST_INVALID"
  | "SOURCE_RATE_LIMITED"
  | "SOURCE_TIMEOUT"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_RESPONSE_INVALID"
  | "SOURCE_TERMS_BLOCKED";

type NeverRetryErrorCode =
  | "CONNECTOR_DISABLED"
  | "SOURCE_AUTH_INVALID"
  | "SOURCE_REQUEST_INVALID"
  | "SOURCE_RESPONSE_INVALID"
  | "SOURCE_TERMS_BLOCKED";
type BoundedRetryErrorCode = "SOURCE_TIMEOUT" | "SOURCE_UNAVAILABLE";

export type ProviderErrorAfterRetry =
  | { strategy: "after"; retryAfterMs: number; resetAt?: UtcTimestamp }
  | { strategy: "after"; retryAfterMs?: never; resetAt: UtcTimestamp };

export type ProviderErrorRetry =
  | { strategy: "never" }
  | { strategy: "bounded" }
  | ProviderErrorAfterRetry;

export type ProviderErrorContract =
  | { code: NeverRetryErrorCode; retry?: { strategy: "never" } }
  | { code: BoundedRetryErrorCode; retry?: { strategy: "bounded" } }
  | { code: "SOURCE_RATE_LIMITED"; retry: ProviderErrorAfterRetry };

function expectedRetryStrategy(code: ProviderErrorCode): ProviderErrorRetry["strategy"] {
  if (code === "SOURCE_RATE_LIMITED") return "after";
  if (code === "SOURCE_TIMEOUT" || code === "SOURCE_UNAVAILABLE") return "bounded";
  return "never";
}

export class ProviderAdapterError extends Error {
  readonly name = "ProviderAdapterError";
  readonly code: ProviderErrorCode;
  readonly retry: ProviderErrorRetry;

  constructor(contract: ProviderErrorContract, options?: ErrorOptions) {
    super(contract.code, options);
    const strategy = expectedRetryStrategy(contract.code);
    const retry: ProviderErrorRetry = contract.retry ?? (
      strategy === "bounded" ? { strategy: "bounded" } : { strategy: "never" }
    );
    if (retry.strategy !== strategy) throw new TypeError(contract.code + " requires " + strategy + " retry");
    if (retry.strategy === "after" && retry.retryAfterMs === undefined && retry.resetAt === undefined) {
      throw new TypeError("SOURCE_RATE_LIMITED requires retryAfterMs or resetAt");
    }
    this.code = contract.code;
    this.retry = retry;
  }
}
