import { createHash } from "node:crypto";

import type { ProviderConfiguration, SourcePostingInput } from "@/lib/sources/provider-adapter";
import { createNormalizedPostingSchema } from "@/lib/validation/collection";

const trackingParameters = /^(?:utm_.+|ref|referrer|source|tracking(?:_?id)?)$/i;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function normalizeSourceUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (trackingParameters.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

export function prepareSourcePosting(
  configuration: ProviderConfiguration,
  input: SourcePostingInput,
) {
  const posting = createNormalizedPostingSchema(configuration).parse(input);
  const normalizedUrl = normalizeSourceUrl(posting.originalUrl);
  const fingerprintInput = {
    providerCode: posting.providerCode,
    externalId: posting.externalId,
    sourceStatus: posting.sourceStatus,
    sourceValues: posting.sourceValues,
    normalized: posting.normalized,
  };

  return {
    ...posting,
    normalizedUrl,
    contentFingerprint: createHash("sha256").update(stableJson(fingerprintInput)).digest("hex"),
  };
}
