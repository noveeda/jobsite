import { describe, expect, it } from "vitest";

import { parseJobFocusHash } from "@/components/focus-anchor";

describe("job focus hash", () => {
  it("accepts only an exact job UUID anchor", () => {
    expect(parseJobFocusHash("#job-00000000-0000-4000-8000-000000000013"))
      .toBe("job-00000000-0000-4000-8000-000000000013");
    expect(parseJobFocusHash("#job-not-a-uuid")).toBeNull();
    expect(parseJobFocusHash("#job-00000000-0000-4000-8000-000000000013-extra")).toBeNull();
  });

  it("fails closed for malformed percent encoding", () => {
    expect(() => parseJobFocusHash("#%E0%A4%A")).not.toThrow();
    expect(parseJobFocusHash("#%E0%A4%A")).toBeNull();
  });
});