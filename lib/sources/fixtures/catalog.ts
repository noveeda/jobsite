export type CatalogFixture = {
  providerCode: string;
  externalId: string;
  originalUrl: string;
  sourceStatus: "active";
  title: string;
  companyName: string;
  locations: readonly string[];
  roleName: string;
  career: "entry" | "experienced" | "any";
  employmentType: "permanent" | "contract" | "intern";
  postedAt: string;
  modifiedAt: string;
  expiresAt: string;
};

export type CursorFixturePage = {
  items: readonly CatalogFixture[];
  nextCursor: string | null;
  snapshotComplete: boolean;
  quotaCost: 1;
};

export type CursorFixtureProvider = {
  code: string;
  cursorStyle: "page-number" | "opaque-token";
  readPage(cursor: string | null): CursorFixturePage;
};

const roles = ["백엔드", "프론트엔드", "데이터", "모바일"] as const;
const locations = ["서울", "경기", "부산", "대전"] as const;
const careers = ["entry", "experienced", "any"] as const;
const employmentTypes = ["permanent", "contract", "intern"] as const;

function makeCatalog(providerCode: string, prefix: string, count = 60): readonly CatalogFixture[] {
  return Array.from({ length: count }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, "0");
    const duplicateExample = index === 0;

    return {
      providerCode,
      externalId: `${prefix}-${String(index + 1).padStart(3, "0")}`,
      originalUrl: `https://${providerCode}.example.invalid/jobs/${index + 1}`,
      sourceStatus: "active" as const,
      title: duplicateExample ? "플랫폼 개발자" : `${roles[index % roles.length]} 개발자 ${index + 1}`,
      companyName: duplicateExample ? "중복예시 주식회사" : `${providerCode} 예시기업 ${index + 1}`,
      locations: [locations[index % locations.length]],
      roleName: roles[index % roles.length],
      career: careers[index % careers.length],
      employmentType: employmentTypes[index % employmentTypes.length],
      postedAt: `2026-07-${day}T00:00:00.000Z`,
      modifiedAt: `2026-08-${day}T00:00:00.000Z`,
      expiresAt: `2026-12-${day}T23:59:59.000Z`,
    };
  });
}

const pageCatalog = makeCatalog("fixture-page", "page");
const tokenCatalog = makeCatalog("fixture-token", "token");

function page(items: readonly CatalogFixture[], start: number, size: number, nextCursor: string | null): CursorFixturePage {
  return {
    items: items.slice(start, start + size),
    nextCursor,
    snapshotComplete: nextCursor === null,
    quotaCost: 1,
  };
}

export const pageCursorFixtureProvider: CursorFixtureProvider = {
  code: "fixture-page",
  cursorStyle: "page-number",
  readPage(cursor) {
    const pageNumber = cursor === null ? 0 : Number(cursor.match(/^page:(\d+)$/)?.[1]);
    if (!Number.isInteger(pageNumber) || pageNumber < 0) throw new Error("INVALID_FIXTURE_CURSOR");

    const size = 20;
    const start = pageNumber * size;
    const nextCursor = start + size < pageCatalog.length ? `page:${pageNumber + 1}` : null;
    return page(pageCatalog, start, size, nextCursor);
  },
};

const tokenStarts = new Map<string | null, number>([
  [null, 0],
  ["after:red", 17],
  ["after:blue", 34],
  ["after:gold", 51],
]);
const nextTokens = ["after:red", "after:blue", "after:gold"] as const;

export const tokenCursorFixtureProvider: CursorFixtureProvider = {
  code: "fixture-token",
  cursorStyle: "opaque-token",
  readPage(cursor) {
    const start = tokenStarts.get(cursor);
    if (start === undefined) throw new Error("INVALID_FIXTURE_CURSOR");

    const nextCursor = nextTokens[Math.floor(start / 17)] ?? null;
    return page(tokenCatalog, start, 17, nextCursor);
  },
};

export const cursorFixtureProviders = [pageCursorFixtureProvider, tokenCursorFixtureProvider] as const;
export const catalogFixtures = [...pageCatalog, ...tokenCatalog] as const;
