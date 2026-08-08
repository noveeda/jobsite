import { describe, expect, it } from "vitest";

import { makeDiscoveryFeedFixture } from "@/lib/e2e/discovery-feed";
import { catalogFeedResponseSchema, catalogJobDetailSchema, parseFeedQuery } from "@/lib/validation/feed";

describe("catalog feed query", () => {
  it("uses safe defaults for an empty query", () => {
    expect(parseFeedQuery({})).toEqual({
      sort: "posted",
      includeExcluded: false,
      saved: false,
      take: 30,
    });
  });

  it("accepts every supported filter and normalizes text", () => {
    expect(parseFeedQuery({
      q: "  백엔드   개발자 ",
      region: "서울",
      role: "backend",
      career: "3-5",
      employment: "permanent",
      deadline: "closingSoon",
      source: "fixture-page",
      sort: "deadline",
      includeExcluded: "true",
      saved: "true",
      take: "60",
    })).toEqual({
      q: "백엔드 개발자",
      region: "서울",
      role: "backend",
      career: "3-5",
      employment: "permanent",
      deadline: "closingSoon",
      source: "fixture-page",
      sort: "deadline",
      includeExcluded: true,
      saved: true,
      take: 60,
    });
  });

  it.each(["0", "29", "31", "59", "1050", "1e2", "not-a-number"])(
    "normalizes an invalid take value %s to the first page",
    (take) => expect(parseFeedQuery({ take }).take).toBe(30),
  );

  it.each(["30", "60", "1020"])("accepts a bounded 30-row multiple %s", (take) => {
    expect(parseFeedQuery({ take }).take).toBe(Number(take));
  });

  it("drops unknown values and repeated parameter smuggling", () => {
    expect(parseFeedQuery({
      region: "서울<script>",
      career: "senior-or-1=1",
      deadline: "expired",
      sort: "random",
      includeExcluded: "yes",
      saved: ["false", "true"],
      take: ["60", "1020"],
    })).toEqual({ sort: "posted", includeExcluded: false, saved: false, take: 60 });
  });

  it("resets pagination when a filter form omits take", () => {
    expect(parseFeedQuery({ q: "새 검색", region: "부산" }).take).toBe(30);
  });

  it("strictly validates the catalog RPC response", () => {
    const response = makeDiscoveryFeedFixture("healthy", parseFeedQuery({}));
    expect(catalogFeedResponseSchema.safeParse(response).success).toBe(true);
    const offset = structuredClone(response);
    offset.providerHealth[0].lastSuccessAt = "2026-08-08T18:00:00+09:00";
    expect(catalogFeedResponseSchema.safeParse(offset).success).toBe(true);
    expect(catalogFeedResponseSchema.safeParse({ ...response, internalOps: "secret" }).success).toBe(false);

    const unsafe = structuredClone(response);
    unsafe.items[0].sources[0].originalUrl = "http://unsafe.example.com";
    expect(catalogFeedResponseSchema.safeParse(unsafe).success).toBe(false);
  });

  it("strictly validates nullable catalog detail RPC results", () => {
    const feedItem = makeDiscoveryFeedFixture("healthy", parseFeedQuery({})).items[0];
    const item = { ...feedItem, personalState: { ...feedItem.personalState, memo: "" } };
    expect(catalogJobDetailSchema.safeParse(item).success).toBe(true);
    expect(catalogJobDetailSchema.safeParse(null).success).toBe(true);
    expect(catalogJobDetailSchema.safeParse({ ...item, internalOps: "secret" }).success).toBe(false);
    expect(catalogJobDetailSchema.safeParse({ ...item, sources: [] }).success).toBe(false);
  });

  it("accepts only the documented provider error codes", () => {
    const validCodes = [
      "CONNECTOR_DISABLED",
      "SOURCE_AUTH_INVALID",
      "SOURCE_REQUEST_INVALID",
      "SOURCE_RATE_LIMITED",
      "SOURCE_TIMEOUT",
      "SOURCE_UNAVAILABLE",
      "SOURCE_RESPONSE_INVALID",
      "SOURCE_TERMS_BLOCKED",
    ] as const;

    for (const errorCode of validCodes) {
      const response = makeDiscoveryFeedFixture("healthy", parseFeedQuery({}));
      response.providerHealth[0].errorCode = errorCode;
      expect(catalogFeedResponseSchema.safeParse(response).success).toBe(true);
    }

    const malformed = makeDiscoveryFeedFixture("healthy", parseFeedQuery({}));
    (malformed.providerHealth[0] as { errorCode: string | null }).errorCode = "SECRET_LEAK";
    expect(catalogFeedResponseSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects duplicate provider codes and inconsistent enabled counts", () => {
    const duplicate = makeDiscoveryFeedFixture("healthy", parseFeedQuery({}));
    duplicate.providerHealth[1].code = duplicate.providerHealth[0].code;
    expect(catalogFeedResponseSchema.safeParse(duplicate).success).toBe(false);

    const inconsistent = makeDiscoveryFeedFixture("healthy", parseFeedQuery({}));
    inconsistent.enabledProviderCount = 1;
    expect(catalogFeedResponseSchema.safeParse(inconsistent).success).toBe(false);

    const disabled = makeDiscoveryFeedFixture("healthy", parseFeedQuery({}));
    disabled.providerHealth[1].enabled = false;
    disabled.enabledProviderCount = 1;
    expect(catalogFeedResponseSchema.safeParse(disabled).success).toBe(true);
  });
});
