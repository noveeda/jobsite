import { describe, expect, it } from "vitest";
import { catalogFixtures, cursorFixtureProviders } from "@/lib/sources/fixtures/catalog";

describe("catalog fixtures", () => {
  it("provides two deterministic cursor styles and 120 active jobs", () => {
    expect(cursorFixtureProviders.map(({ cursorStyle }) => cursorStyle)).toEqual(["page-number", "opaque-token"]);
    expect(catalogFixtures).toHaveLength(120);
    expect(catalogFixtures[0].externalId).toBe("page-001");
    expect(catalogFixtures.at(-1)?.externalId).toBe("token-060");
    expect(catalogFixtures.every(({ sourceStatus, originalUrl }) => sourceStatus === "active" && new URL(originalUrl).hostname.endsWith(".invalid"))).toBe(true);
  });

  it("contains exactly one intentional cross-provider duplicate signature", () => {
    const signatures = catalogFixtures.map(({ title, companyName }) => [title, companyName].join("|"));
    const duplicateCount = signatures.length - new Set(signatures).size;
    expect(duplicateCount).toBe(1);
  });

  it.each(cursorFixtureProviders)("reads every $code record exactly once", (provider) => {
    const records = [];
    let cursor: string | null = null;
    let quotaCost = 0;

    do {
      const result = provider.readPage(cursor);
      records.push(...result.items);
      quotaCost += result.quotaCost;
      cursor = result.nextCursor;
      expect(result.snapshotComplete).toBe(cursor === null);
    } while (cursor !== null);

    expect(records).toHaveLength(60);
    expect(new Set(records.map(({ externalId }) => externalId)).size).toBe(60);
    expect(quotaCost).toBe(provider.cursorStyle === "page-number" ? 3 : 4);
  });

  it.each(cursorFixtureProviders)("rejects an invalid $code cursor", (provider) => {
    expect(() => provider.readPage("not-a-cursor")).toThrow("INVALID_FIXTURE_CURSOR");
  });
});
