import { describe, expect, it } from "vitest";
import { consumeRateLimit } from "@/lib/security/rate-limit";

describe("durable rate limit client", () => {
  it("returns the database decision", async () => {
    const rpc = async () => ({ data: [{ allowed: false, limit_value: 10, remaining: 0, reset_at: "2026-08-07T01:00:00Z", retry_after_seconds: 42 }], error: null });
    await expect(consumeRateLimit({ rpc } as never, "source_preview")).resolves.toEqual({ allowed: false, retryAfter: 42, unavailable: false });
  });

  it("fails closed when the decision store is unavailable", async () => {
    const rpc = async () => ({ data: null, error: new Error("secret db error") });
    await expect(consumeRateLimit({ rpc } as never, "import_commit")).resolves.toEqual({ allowed: false, retryAfter: 60, unavailable: true });
  });
});
