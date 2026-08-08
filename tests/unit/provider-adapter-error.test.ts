import { describe, expect, it } from "vitest";
import { ProviderAdapterError } from "@/lib/sources/provider-adapter";

describe("provider adapter error contract", () => {
  it("derives the required retry policy", () => {
    expect(new ProviderAdapterError({ code: "SOURCE_AUTH_INVALID" }).retry).toEqual({ strategy: "never" });
    expect(new ProviderAdapterError({ code: "SOURCE_TIMEOUT" }).retry).toEqual({ strategy: "bounded" });
    expect(new ProviderAdapterError({
      code: "SOURCE_RATE_LIMITED",
      retry: { strategy: "after", retryAfterMs: 1_000 },
    }).retry).toEqual({ strategy: "after", retryAfterMs: 1_000 });
  });

  it("rejects impossible combinations even when input bypasses TypeScript", () => {
    expect(() => new ProviderAdapterError(
      // @ts-expect-error timeout errors require bounded retry
      { code: "SOURCE_TIMEOUT", retry: { strategy: "never" } },
    )).toThrow("SOURCE_TIMEOUT requires bounded retry");
    expect(() => new ProviderAdapterError(
      // @ts-expect-error rate limits require a retry time or reset time
      { code: "SOURCE_RATE_LIMITED", retry: { strategy: "after" } },
    )).toThrow("SOURCE_RATE_LIMITED requires retryAfterMs or resetAt");
  });
});