import { describe, expect, it, vi } from "vitest";
import { logSafeEvent, requestId, toSafeEvent } from "@/lib/observability/safe-logger";

describe("safe operational events", () => {
  it("keeps only the bounded allowlist", () => {
    const value = toSafeEvent({
      requestId: "request_12345678",
      category: "account.delete",
      outcome: "failure",
      errorCode: "ACCOUNT_DELETE_UNAVAILABLE",
      durationMs: 1200,
      authorization: "Bearer secret",
      cookie: "session=secret",
      memo: "private memo",
      body: "job body",
    } as never);
    const text = JSON.stringify(value);
    expect(text).toContain("account.delete");
    expect(text).toContain("gte1000");
    expect(text).not.toMatch(/Bearer|session|private memo|job body/);
  });

  it("logs JSON and accepts only safe request IDs", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logSafeEvent({ requestId: requestId("bad id"), category: "health", outcome: "success", durationMs: 20 });
    expect(() => JSON.parse(String(spy.mock.calls[0][0]))).not.toThrow();
    expect(String(spy.mock.calls[0][0])).not.toContain("bad id");
    spy.mockRestore();
  });
});
