import { describe, expect, it } from "vitest";

import { createCatalogDuplicateCandidate } from "@/lib/domain/catalog-duplicates";
import { catalogDuplicateControlState } from "@/lib/domain/catalog-duplicate-control";
import { catalogDuplicateCandidateSchema, catalogDuplicateDetailSchema } from "@/lib/validation/feed";

const leftId = "10000000-0000-4000-8000-000000000001";
const rightId = "20000000-0000-4000-8000-000000000002";

function job(overrides: Partial<Parameters<typeof createCatalogDuplicateCandidate>[0]> = {}) {
  return {
    id: leftId,
    companyName: "(주) 예시 회사",
    title: "백엔드 플랫폼 개발자 채용",
    roleName: "백엔드 개발",
    locations: ["서울"],
    postedAt: "2026-08-01T00:00:00+09:00",
    sources: [{ provider: "saramin" }],
    ...overrides,
  };
}

describe("catalog duplicate candidates", () => {
  it("creates one explainable, ordered cross-provider candidate without grouping", () => {
    const candidate = createCatalogDuplicateCandidate(
      job(),
      job({
        id: rightId,
        companyName: "예시회사",
        title: "백엔드 플랫폼 개발자 모집",
        sources: [{ provider: "fixture-token" }],
        postedAt: "2026-08-05T00:00:00+09:00",
      }),
    );

    expect(candidate).toMatchObject({
      leftJobId: leftId,
      rightJobId: rightId,
      reasons: {
        companyMatch: true,
        titleSimilarity: 1,
        roleMatch: true,
        locationMatch: true,
        postedWithinDays: true,
      },
    });
    expect(candidate?.score).toBeGreaterThanOrEqual(0.7);
    expect(catalogDuplicateCandidateSchema.safeParse(candidate).success).toBe(true);
  });

  it("uses the same ordered identity and explanation when inputs are reversed", () => {
    const left = job();
    const right = job({ id: rightId, sources: [{ provider: "fixture-token" }] });

    expect(createCatalogDuplicateCandidate(left, right)).toEqual(createCatalogDuplicateCandidate(right, left));
  });

  it.each([
    ["self pair", job(), job()],
    ["same-provider evidence", job(), job({ id: rightId })],
    ["weak match", job(), job({ id: rightId, companyName: "다른 회사", title: "브랜드 디자이너", roleName: "디자인", locations: ["부산"], sources: [{ provider: "fixture-token" }] })],
    ["malformed left date", job({ postedAt: "not-a-date" }), job({ id: rightId, sources: [{ provider: "fixture-token" }] })],
    ["malformed right date", job(), job({ id: rightId, postedAt: "2026-02-30T00:00:00+09:00", sources: [{ provider: "fixture-token" }] })],
  ])("rejects %s", (_label, left, right) => {
    expect(createCatalogDuplicateCandidate(left, right)).toBeNull();
  });

  it("keeps score and explanation fields bounded for strict client parsing", () => {
    const candidate = createCatalogDuplicateCandidate(
      job({ locations: ["서울", "서울", "서울"] }),
      job({ id: rightId, locations: ["서울"], sources: [{ provider: "fixture-token" }] }),
    );

    expect(candidate).not.toBeNull();
    expect(candidate?.score).toBeGreaterThanOrEqual(0);
    expect(candidate?.score).toBeLessThanOrEqual(1);
    expect(candidate?.reasons.titleSimilarity).toBeGreaterThanOrEqual(0);
    expect(candidate?.reasons.titleSimilarity).toBeLessThanOrEqual(1);
    expect(catalogDuplicateCandidateSchema.safeParse({ ...candidate, unexpected: "unsafe" }).success).toBe(false);
    expect(catalogDuplicateCandidateSchema.safeParse({ ...candidate, score: 1.01 }).success).toBe(false);
    expect(catalogDuplicateCandidateSchema.safeParse({ ...candidate, reasons: { ...candidate?.reasons, titleSimilarity: -0.01 } }).success).toBe(false);
  });

  it("accepts only bounded, credential-free duplicate detail data", () => {
    const detail = {
      candidates: [{
        id: "30000000-0000-4000-8000-000000000003",
        counterpartId: rightId,
        score: 0.9,
        reasons: ["company_match", "title_match"],
        evidenceRevision: 2,
        sources: [
          { provider: "fixture-one", providerName: "Fixture one", originalUrl: "https://one.example.com/jobs/1", observedAt: "2026-08-09T00:00:00Z" },
          { provider: "fixture-two", providerName: "Fixture two", originalUrl: "https://two.example.com/jobs/2", observedAt: "2026-08-09T00:00:00Z" },
        ],
        conflicts: [{ field: "deadlineAt", values: [
          { provider: "fixture-one", observedAt: "2026-08-09T00:00:00Z", value: "2026-08-20T00:00:00Z" },
          { provider: "fixture-two", observedAt: "2026-08-09T00:00:00Z", value: "2026-08-21T00:00:00Z" },
        ] }],
        currentUser: { decision: "merged", revision: 1, history: [{ action: "merge", createdAt: "2026-08-09T00:00:00Z" }] },
        group: { representativeId: leftId, memberIds: [leftId, rightId] },
      }],
    };

    expect(catalogDuplicateDetailSchema.safeParse(detail).success).toBe(true);
    expect(catalogDuplicateDetailSchema.safeParse({ ...detail, unexpected: true }).success).toBe(false);
    expect(catalogDuplicateDetailSchema.safeParse({
      ...detail,
      candidates: [{ ...detail.candidates[0], sources: [{ ...detail.candidates[0].sources[0], originalUrl: "https://user:pass@one.example.com/jobs/1" }] }],
    }).success).toBe(false);
    expect(catalogDuplicateDetailSchema.safeParse({ ...detail, candidates: Array.from({ length: 26 }, () => detail.candidates[0]) }).success).toBe(false);
  });
});

describe("catalog duplicate control state", () => {
  it.each([
    ["undecided", null, true, { canMerge: true, canSeparate: true, canUndo: false, canReport: true }],
    ["merged", "merged", true, { canMerge: false, canSeparate: true, canUndo: true, canReport: true }],
    ["separate", "separate", true, { canMerge: true, canSeparate: false, canUndo: true, canReport: true }],
    ["inactive", "merged", false, { canMerge: false, canSeparate: false, canUndo: false, canReport: false }],
  ] as const)("exposes only the valid %s actions", (_label, decision, active, expected) => {
    expect(catalogDuplicateControlState({ decision, active })).toMatchObject(expected);
  });

  it("makes an indirect conflict explicit and preserves the exact undoable blocker ids", () => {
    expect(catalogDuplicateControlState({
      decision: "merged",
      active: true,
      conflict: { code: "INDIRECT_MERGE_CONFLICT", blockingEdges: [rightId] },
    })).toMatchObject({
      canMerge: false,
      canSeparate: false,
      blocked: true,
      blockingEdges: [rightId],
    });
  });
});
