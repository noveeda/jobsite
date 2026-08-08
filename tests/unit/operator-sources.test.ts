import { describe, expect, it } from "vitest";

import { requireOperator } from "@/lib/auth";

const operatorId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const secretCanary = "operator-secret-canary-7c44";

function expectDenied(userId: string | null | undefined) {
  try {
    requireOperator(userId, [operatorId]);
    throw new Error("EXPECTED_OPERATOR_DENIAL");
  } catch (error) {
    expect(String(error)).toContain("OPERATOR_ACCESS_DENIED");
    expect(String(error)).not.toContain(secretCanary);
    if (userId) expect(String(error)).not.toContain(userId);
  }
}

describe("operator source access", () => {
  it.each([null, undefined, "", "not-a-uuid", `${secretCanary}-not-a-uuid`, otherId])(
    "denies missing, invalid, and nonmember user ID %s",
    (userId) => expectDenied(userId),
  );

  it("matches complete IDs instead of prefixes or substrings", () => {
    expectDenied(operatorId.slice(0, -1));
    expectDenied(`prefix-${operatorId}`);
  });

  it("returns only the authorized operator ID", () => {
    const result = requireOperator(operatorId, [operatorId]);
    expect(result).toBe(operatorId);
    expect(JSON.stringify(result)).not.toContain(secretCanary);
  });
});
