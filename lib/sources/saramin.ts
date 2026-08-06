import { SourceError, type SourceReference, type SourceResult } from "./connector";

type SaraminFixture = { id?: string; title?: string; company?: string; url?: string; location?: string; deadline?: string };

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
  if (process.env.SARAMIN_CONNECTOR_ENABLED !== "true" || !key || !reference.externalId) throw new SourceError("CONNECTOR_DISABLED");
  if (!dailyBudget.consume(new Date())) throw new SourceError("SOURCE_RATE_LIMITED");
  const url = new URL("https://oapi.saramin.co.kr/job-search");
  url.searchParams.set("access-key", key);
  url.searchParams.set("id", reference.externalId);
  const response = await fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new SourceError("SOURCE_UNAVAILABLE");
  return normalizeSaraminPayload(await response.json() as SaraminFixture);
}