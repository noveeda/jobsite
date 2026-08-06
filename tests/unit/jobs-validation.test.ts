import { describe, expect, it } from "vitest";
import { jobInputSchema, sourceUrlSchema } from "@/lib/validation/jobs";

describe("job input validation", () => {
  it("accepts a bounded manual job", () => {
    const result = jobInputSchema.safeParse({
      title: "백엔드 개발자",
      companyName: "예시 회사",
      originalUrl: "https://example.com/jobs/1",
      deadlineKind: "unknown",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-HTTPS and fixed deadlines without a date", () => {
    expect(sourceUrlSchema.safeParse("http://example.com/job").success).toBe(false);
    expect(jobInputSchema.safeParse({
      title: "개발자",
      companyName: "회사",
      originalUrl: "https://example.com/job",
      deadlineKind: "fixed",
    }).success).toBe(false);
  });
});
