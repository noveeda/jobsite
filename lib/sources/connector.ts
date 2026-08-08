import { previewJobKorea } from "./jobkorea";
import { previewSaramin } from "./saramin";
import { resolveSaraminActivation } from "./activation";

export type Provider = "manual" | "saramin" | "jobkorea" | "other";
export type SourceReference = {
  provider: Provider;
  externalId: string | null;
  originalUrl: string;
  connectorMode: "manual" | "approved_api";
};
export type SourceResult = {
  provider: "saramin" | "jobkorea";
  externalId: string;
  originalUrl: string;
  observedAt: string;
  status: "active" | "closed" | "unknown";
  values: Partial<{
    title: string;
    companyName: string;
    roleName: string;
    locations: string[];
    deadlineAt: string;
    deadlineKind: "fixed" | "rolling" | "until_hired" | "unknown";
  }>;
  provenance: Record<string, { origin: "source" | "normalized" | "missing" | "not_applicable" | "failed"; observedAt: string }>;
};

export class SourceError extends Error {
  constructor(public code: "MANUAL_ONLY" | "CONNECTOR_DISABLED" | "SOURCE_ID_NOT_FOUND" | "SOURCE_RATE_LIMITED" | "SOURCE_UNAVAILABLE" | "SOURCE_RESPONSE_INVALID") {
    super(code);
  }
}

export type RefreshJob = {
  title: string;
  companyName: string;
  roleName: string | null;
  locations: string[];
  deadlineAt: string | null;
  deadlineKind: "fixed" | "rolling" | "until_hired" | "unknown";
  fieldProvenance: Record<string, { origin?: string } | undefined>;
};

export type RefreshSourceInput = {
  job: RefreshJob;
  source: {
    id: string;
    provider: Provider;
    connectorMode: "manual" | "approved_api";
    externalId: string | null;
    originalUrl: string;
    status: "active" | "closed" | "unreachable" | "unsupported" | "unknown";
    lastCheckedAt: string | null;
    lastSuccessAt: string | null;
  };
};

export type RefreshPersistence = {
  sourceId: string;
  status: "active" | "closed" | "unreachable" | "unsupported" | "unknown";
  checkedAt: string;
  lastSuccessAt: string | null;
  changedFields: string[];
  errorCode: SourceError["code"] | null;
  sourceValues: SourceResult["values"];
  jobPatch: Partial<RefreshJob>;
};

export type RefreshResponse = {
  status: RefreshPersistence["status"];
  checkedAt: string;
  lastSuccessAt: string | null;
  changedFields: string[];
  errorCode?: SourceError["code"] | null;
  cached: boolean;
  job: RefreshJob;
};

type RefreshDependencies = {
  now?: () => Date;
  providerEnabled?: (provider: Provider) => boolean;
  providerCall?: (reference: SourceReference) => Promise<SourceResult>;
  persist?: (result: RefreshPersistence) => Promise<void>;
};

type PreviewDependencies = {
  resolveSaraminActivation?: typeof resolveSaraminActivation;
  providerCall?: (reference: SourceReference) => Promise<SourceResult>;
};

const REFRESH_TTL_MS = 30 * 60 * 1000;
const refreshableFields = ["title", "companyName", "roleName", "locations", "deadlineAt", "deadlineKind"] as const;

async function callProvider(reference: SourceReference) {
  if (reference.provider === "saramin") return previewSaramin(reference);
  if (reference.provider === "jobkorea") return previewJobKorea(reference);
  throw new SourceError("MANUAL_ONLY");
}

async function activeByApproval(provider: Provider) {
  if (provider !== "saramin") return false;
  return (await resolveSaraminActivation()).enabled;
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function refreshSource(input: RefreshSourceInput, dependencies: RefreshDependencies = {}): Promise<RefreshResponse> {
  const now = dependencies.now?.() ?? new Date();
  const checkedAt = now.toISOString();
  const enabled = dependencies.providerEnabled ?? activeByApproval;
  const providerCall = dependencies.providerCall ?? callProvider;
  const persist = dependencies.persist ?? (async () => {});

  if (input.source.lastCheckedAt && now.getTime() - new Date(input.source.lastCheckedAt).getTime() < REFRESH_TTL_MS) {
    return {
      status: input.source.status,
      checkedAt: input.source.lastCheckedAt,
      lastSuccessAt: input.source.lastSuccessAt,
      changedFields: [],
      cached: true,
      job: { ...input.job },
    };
  }

  const unsupported = input.source.connectorMode !== "approved_api"
    || input.source.provider === "other"
    || !input.source.externalId
    || !(await enabled(input.source.provider));

  if (unsupported) {
    const errorCode: SourceError["code"] = input.source.connectorMode === "manual" || input.source.provider === "other"
      ? "MANUAL_ONLY"
      : input.source.externalId ? "CONNECTOR_DISABLED" : "SOURCE_ID_NOT_FOUND";
    const result: RefreshPersistence = {
      sourceId: input.source.id,
      status: "unsupported",
      checkedAt,
      lastSuccessAt: input.source.lastSuccessAt,
      changedFields: [],
      errorCode,
      sourceValues: {},
      jobPatch: {},
    };
    await persist(result);
    return { ...result, cached: false, job: { ...input.job }, errorCode };
  }

  try {
    const observed = await providerCall({
      provider: input.source.provider,
      externalId: input.source.externalId,
      originalUrl: input.source.originalUrl,
      connectorMode: input.source.connectorMode,
    });
    const job = { ...input.job };
    const jobPatch: Partial<RefreshJob> = {};
    const changedFields: string[] = [];
    for (const field of refreshableFields) {
      const next = observed.values[field];
      if (next === undefined || input.job.fieldProvenance[field]?.origin === "user" || sameValue(input.job[field], next)) continue;
      Object.assign(job, { [field]: next });
      Object.assign(jobPatch, { [field]: next });
      changedFields.push(field);
    }
    const result: RefreshPersistence = {
      sourceId: input.source.id,
      status: observed.status,
      checkedAt,
      lastSuccessAt: checkedAt,
      changedFields,
      errorCode: null,
      sourceValues: observed.values,
      jobPatch,
    };
    await persist(result);
    return { ...result, cached: false, job };
  } catch (error) {
    const errorCode = error instanceof SourceError ? error.code : "SOURCE_UNAVAILABLE";
    const result: RefreshPersistence = {
      sourceId: input.source.id,
      status: errorCode === "MANUAL_ONLY" || errorCode === "CONNECTOR_DISABLED" || errorCode === "SOURCE_ID_NOT_FOUND" ? "unsupported" : "unreachable",
      checkedAt,
      lastSuccessAt: input.source.lastSuccessAt,
      changedFields: [],
      errorCode,
      sourceValues: {},
      jobPatch: {},
    };
    await persist(result);
    return { ...result, cached: false, job: { ...input.job }, errorCode };
  }
}

export function recognizeSource(input: string): SourceReference {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("HTTPS URL만 등록할 수 있습니다.");
  const host = url.hostname.toLowerCase();
  if (host === "saramin.co.kr" || host.endsWith(".saramin.co.kr")) {
    const externalId = url.searchParams.get("rec_idx") ?? url.pathname.match(/\/(?:job|view)\/(\d+)/)?.[1] ?? null;
    return { provider: "saramin", externalId, originalUrl: url.toString(), connectorMode: process.env.SARAMIN_CONNECTOR_ENABLED === "true" ? "approved_api" : "manual" };
  }
  if (host === "jobkorea.co.kr" || host.endsWith(".jobkorea.co.kr")) {
    const externalId = url.pathname.match(/GI_Read\/(\d+)/i)?.[1] ?? url.searchParams.get("GI_No");
    return { provider: "jobkorea", externalId, originalUrl: url.toString(), connectorMode: process.env.JOBKOREA_CONNECTOR_ENABLED === "true" ? "approved_api" : "manual" };
  }
  return { provider: "other", externalId: null, originalUrl: url.toString(), connectorMode: "manual" };
}

export function canonicalizeUrl(input: string) {
  const url = new URL(input);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  return url.toString();
}

export async function previewSource(
  input: string,
  dependencies: PreviewDependencies = {},
): Promise<{ reference: SourceReference; result: SourceResult | null; warnings: string[] }> {
  let reference = recognizeSource(input);
  if (reference.provider === "saramin" && reference.externalId) {
    const activation = await (dependencies.resolveSaraminActivation ?? resolveSaraminActivation)();
    if (!activation.enabled) return { reference, result: null, warnings: [activation.reason] };
    reference = { ...reference, connectorMode: "approved_api" };
  }
  if (reference.connectorMode === "manual" || !reference.externalId) return { reference, result: null, warnings: ["SOURCE_MANUAL_ONLY"] };
  try {
    const result = dependencies.providerCall
      ? await dependencies.providerCall(reference)
      : reference.provider === "saramin" ? await previewSaramin(reference) : await previewJobKorea(reference);
    return { reference, result, warnings: [] };
  } catch (error) {
    const code = error instanceof SourceError ? error.code : "SOURCE_UNAVAILABLE";
    return { reference: { ...reference, connectorMode: "manual" }, result: null, warnings: [code] };
  }
}
