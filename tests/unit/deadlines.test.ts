import { describe, expect, it } from "vitest";
import { deadlineState } from "@/lib/domain/deadlines";
const now = new Date("2026-08-06T00:00:00Z");
describe("deadline state", () => {
  it("distinguishes fixed, expired, rolling, until-hired and unknown", () => {
    expect(deadlineState("fixed", "2026-08-07T00:00:00Z", now).key).toBe("due_soon");
    expect(deadlineState("fixed", "2026-08-05T00:00:00Z", now).key).toBe("expired");
    expect(deadlineState("rolling", null, now).key).toBe("rolling");
    expect(deadlineState("until_hired", null, now).key).toBe("until_hired");
    expect(deadlineState("unknown", null, now).key).toBe("unknown");
  });
});
