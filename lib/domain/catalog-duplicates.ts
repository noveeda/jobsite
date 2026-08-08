export type CatalogDuplicateJob = {
  id: string;
  companyName: string;
  title: string;
  roleName?: string | null;
  locations: readonly string[];
  postedAt?: string | null;
  sources: readonly { provider: string }[];
};

export type CatalogDuplicateReasons = {
  companyMatch: boolean;
  titleSimilarity: number;
  roleMatch: boolean;
  locationMatch: boolean;
  postedWithinDays: boolean;
};

export type CatalogDuplicateCandidate = {
  leftJobId: string;
  rightJobId: string;
  score: number;
  reasons: CatalogDuplicateReasons;
};

const providerCode = /^[a-z][a-z0-9_-]{0,39}$/;
const dateTimeWithOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const candidateThreshold = 0.7;
const matchThreshold = 0.8;
const fourteenDaysMs = 14 * 86_400_000;

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\(주\)|주식회사|채용|모집|[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(value: string) {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

function similarity(left: string, right: string) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return common / Math.max(leftTokens.size, rightTokens.size, 1);
}

function companySimilarity(left: string, right: string) {
  const leftCompact = normalize(left).replaceAll(" ", "");
  const rightCompact = normalize(right).replaceAll(" ", "");
  return leftCompact && leftCompact === rightCompact ? 1 : similarity(left, right);
}

function rounded(value: number, digits: number) {
  return Number(Math.min(1, Math.max(0, value)).toFixed(digits));
}

function dateValue(value: string | null | undefined) {
  if (value === undefined || value === null) return null;
  if (!dateTimeWithOffset.test(value)) return undefined;

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
  ) return undefined;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function providerCodes(job: CatalogDuplicateJob) {
  const codes = job.sources
    .map(({ provider }) => typeof provider === "string" ? provider.trim().toLowerCase() : "")
    .filter((provider) => providerCode.test(provider));
  return new Set(codes);
}

function hasCrossProviderEvidence(left: CatalogDuplicateJob, right: CatalogDuplicateJob) {
  const leftProviders = providerCodes(left);
  const rightProviders = providerCodes(right);
  return [...leftProviders].some((leftProvider) => [...rightProviders].some((rightProvider) => leftProvider !== rightProvider));
}

function hasSharedLocation(left: readonly string[], right: readonly string[]) {
  const leftLocations = new Set(left.map(normalize).filter(Boolean));
  return right.some((location) => leftLocations.has(normalize(location)));
}

/**
 * Produces a candidate suggestion only. It deliberately does not mutate or group
 * either catalog job, source posting, or personal state.
 */
export function createCatalogDuplicateCandidate(
  first: CatalogDuplicateJob,
  second: CatalogDuplicateJob,
): CatalogDuplicateCandidate | null {
  if (first.id === second.id || !hasCrossProviderEvidence(first, second)) return null;

  const firstDate = dateValue(first.postedAt);
  const secondDate = dateValue(second.postedAt);
  if (firstDate === undefined || secondDate === undefined) return null;

  const companyMatch = companySimilarity(first.companyName, second.companyName) >= matchThreshold;
  const titleSimilarity = rounded(similarity(first.title, second.title), 4);
  const roleMatch = Boolean(
    first.roleName
    && second.roleName
    && similarity(first.roleName, second.roleName) >= matchThreshold,
  );
  const locationMatch = hasSharedLocation(first.locations, second.locations);
  const postedWithinDays = firstDate !== null && secondDate !== null && Math.abs(firstDate - secondDate) <= fourteenDaysMs;
  const score = rounded(
    (companyMatch ? 0.35 : 0)
    + titleSimilarity * 0.2
    + (roleMatch ? 0.2 : 0)
    + (locationMatch ? 0.15 : 0)
    + (postedWithinDays ? 0.1 : 0),
    4,
  );

  if (!companyMatch || titleSimilarity < matchThreshold || score < candidateThreshold) return null;

  const [left, right] = first.id < second.id ? [first, second] : [second, first];
  return {
    leftJobId: left.id,
    rightJobId: right.id,
    score,
    reasons: { companyMatch, titleSimilarity, roleMatch, locationMatch, postedWithinDays },
  };
}
