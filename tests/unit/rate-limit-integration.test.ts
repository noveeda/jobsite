import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, type RateLimitAction } from "@/lib/security/rate-limit";

function databaseDecision(overrides: Partial<{
  allowed: boolean;
  remaining: number;
  reset_at: string;
  retry_after_seconds: number;
}> = {}) {
  return {
    allowed: true,
    limit_value: 10,
    remaining: 9,
    reset_at: "2026-08-07T01:00:00.000Z",
    retry_after_seconds: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("database rate-limit client integration boundary", () => {
  it("fails closed without echoing a database error when RPC returns an error", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_BYPASS_AUTH", "false");
    const canary = "secret-canary-database-error-1f72aa";
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: new Error(canary),
    });

    const result = await consumeRateLimit({ rpc } as never, "import_commit");

    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      target_action: "import_commit",
    });
    expect(result).toEqual({
      allowed: false,
      retryAfter: 60,
      unavailable: true,
    });
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it.each([
    { data: null, error: null },
    { data: [], error: null },
  ])("fails closed when the RPC produces no decision: %j", async (response) => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_BYPASS_AUTH", "false");
    const rpc = vi.fn().mockResolvedValue(response);

    await expect(consumeRateLimit({ rpc } as never, "account_delete")).resolves.toEqual({
      allowed: false,
      retryAfter: 60,
      unavailable: true,
    });
  });

  it("maps a denied database decision to bounded 429 retry metadata", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_BYPASS_AUTH", "false");
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [databaseDecision({
          allowed: false,
          remaining: 0,
          retry_after_seconds: 0,
        })],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [databaseDecision({
          allowed: false,
          remaining: 0,
          retry_after_seconds: 42,
        })],
        error: null,
      });

    await expect(consumeRateLimit({ rpc } as never, "source_preview")).resolves.toEqual({
      allowed: false,
      retryAfter: 1,
      unavailable: false,
    });
    await expect(consumeRateLimit({ rpc } as never, "source_preview")).resolves.toEqual({
      allowed: false,
      retryAfter: 42,
      unavailable: false,
    });
  });

  it("preserves remaining and reset metadata for an allowed request", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_BYPASS_AUTH", "false");
    const rpc = vi.fn().mockResolvedValue({
      data: [databaseDecision({
        allowed: true,
        remaining: 7,
        reset_at: "2026-08-07T01:30:00.000Z",
      })],
      error: null,
    });

    await expect(consumeRateLimit({ rpc } as never, "source_refresh")).resolves.toEqual({
      allowed: true,
      remaining: 7,
      resetAt: "2026-08-07T01:30:00.000Z",
    });
  });

  it("binds every action independently to its exact RPC argument", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_BYPASS_AUTH", "false");
    const actions: RateLimitAction[] = [
      "source_preview",
      "source_refresh",
      "import_validate",
      "import_commit",
      "consent_write",
      "account_delete",
    ];
    const remainingByAction = new Map(actions.map((action, index) => [action, index + 1]));
    const rpc = vi.fn(async (_name: string, args: { target_action: RateLimitAction }) => {
      const remaining = remainingByAction.get(args.target_action) ?? 0;
      return {
        data: [databaseDecision({
          remaining,
          reset_at: "2026-08-07T0" + remaining + ":00:00.000Z",
        })],
        error: null,
      };
    });

    const results = await Promise.all(
      actions.map((action) => consumeRateLimit({ rpc } as never, action)),
    );

    expect(rpc.mock.calls.map(([, args]) => args)).toEqual(
      actions.map((target_action) => ({ target_action })),
    );
    expect(results.map((result) => result.allowed ? result.remaining : -1)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
});
