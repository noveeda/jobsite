import { describe, expect, it } from "vitest";
import { applySourceValues, buildSummary, markUserFields } from "@/lib/domain/provenance";

describe("field provenance", () => {
  it("marks only edited fields as user input", () => {
    const next = markUserFields(
      { title: { origin: "source", sourceId: "source-1", observedAt: "2026-08-06T00:00:00Z" } },
      ["title"],
    );
    expect(next.title).toEqual({ origin: "user", sourceId: null, observedAt: null });
  });

  it("builds deterministic summaries and preserves user fields", () => {
    expect(buildSummary({ companyName: "회사", title: "개발자", locations: ["서울"] })).toBe("회사 — 개발자 — 서울");
    expect(applySourceValues({ title: "사용자 제목", company: "기존" }, { title: "원문 제목", company: "새 회사" }, { title: { origin: "user" }, company: { origin: "source" } })).toEqual({ title: "사용자 제목", company: "새 회사" });
  });
});
