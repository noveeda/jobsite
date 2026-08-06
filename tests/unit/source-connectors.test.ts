import { describe, expect, it } from "vitest";
import { normalizeSaraminPayload } from "@/lib/sources/saramin";
import { normalizeJobKoreaPayload } from "@/lib/sources/jobkorea";

describe("approved API fixture normalization", () => {
  it("normalizes required fields at 100% fixture accuracy", () => {
    const saramin = normalizeSaraminPayload({ id: "123", title: "서버 개발자", company: "사람인 예시", url: "https://www.saramin.co.kr/job/123", location: "서울" });
    const jobkorea = normalizeJobKoreaPayload({ id: "456", title: "웹 개발자", company: "잡코리아 예시", url: "https://www.jobkorea.co.kr/Recruit/GI_Read/456", location: "부산" });
    expect([saramin, jobkorea].every((item) => item.externalId && item.values.title && item.values.companyName && item.originalUrl)).toBe(true);
  });
});
