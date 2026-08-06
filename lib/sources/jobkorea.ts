import { SourceError, type SourceReference, type SourceResult } from "./connector";
type JobKoreaFixture = { id?: string; title?: string; company?: string; url?: string; location?: string; deadline?: string };
export function normalizeJobKoreaPayload(payload: JobKoreaFixture): SourceResult {
  if (!payload.id || !payload.title || !payload.company || !payload.url) throw new SourceError("SOURCE_RESPONSE_INVALID");
  const observedAt = new Date().toISOString();
  return { provider: "jobkorea", externalId: payload.id, originalUrl: payload.url, observedAt, status: "active", values: { title: payload.title, companyName: payload.company, locations: payload.location ? [payload.location] : [], deadlineAt: payload.deadline, deadlineKind: payload.deadline ? "fixed" : "unknown" }, provenance: Object.fromEntries(["title", "companyName", "locations"].map((key) => [key, { origin: "source" as const, observedAt }])) };
}
export async function previewJobKorea(reference: SourceReference, fetcher: typeof fetch = fetch): Promise<SourceResult> {
  const issuedUrl = process.env.JOBKOREA_API_URL;
  if (process.env.JOBKOREA_CONNECTOR_ENABLED !== "true" || !issuedUrl || !reference.externalId) throw new SourceError("CONNECTOR_DISABLED");
  const url = new URL(issuedUrl); url.searchParams.set("id", reference.externalId);
  const response = await fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new SourceError("SOURCE_UNAVAILABLE");
  return normalizeJobKoreaPayload(await response.json() as JobKoreaFixture);
}
