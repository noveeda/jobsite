import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteAccount } from "@/app/api/account/route";
import { GET as healthCheck } from "@/app/api/health/route";
import { logSafeEvent, toSafeEvent } from "@/lib/observability/safe-logger";

const canaries = {
  apiKey: "secret-canary-api-key-7f2c9d",
  bearer: "Bearer secret-canary-token-8a41e6",
  cookie: "session=secret-canary-cookie-21d0bf",
  memo: "secret-canary-private-memo-47c3aa",
  jobBody: "secret-canary-job-body-95b124",
  databaseUrl: "https://secret-canary-db.invalid",
} as const;

function expectNoCanary(text: string) {
  for (const value of Object.values(canaries)) expect(text).not.toContain(value);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("secret canary leakage boundaries", () => {
  it("drops nested and top-level untrusted fields from structured events", () => {
    const event = toSafeEvent({
      requestId: "request_canary_1234",
      category: "import_commit",
      outcome: "failure",
      errorCode: "RESTORE_FAILED",
      durationMs: 1200,
      authorization: canaries.bearer,
      cookie: canaries.cookie,
      apiKey: canaries.apiKey,
      request: {
        url: canaries.databaseUrl + "/jobs?token=" + canaries.apiKey,
        body: { memo: canaries.memo, description: canaries.jobBody },
      },
      error: new Error([canaries.apiKey, canaries.jobBody].join(" ")),
    } as never);

    const serialized = JSON.stringify(event);
    expect(event).toMatchObject({
      requestId: "request_canary_1234",
      category: "import_commit",
      outcome: "failure",
      errorCode: "RESTORE_FAILED",
      durationBucket: "gte1000",
    });
    expect(Object.keys(event).sort()).toEqual([
      "category",
      "durationBucket",
      "errorCode",
      "outcome",
      "requestId",
      "timestamp",
    ]);
    expectNoCanary(serialized);
  });

  it("writes one parseable allowlisted log without serializing canary payloads", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logSafeEvent({
      requestId: "request_canary_5678",
      category: "source_preview",
      outcome: "denied",
      errorCode: "RATE_LIMITED",
      durationMs: 20,
      token: canaries.bearer,
      cookie: canaries.cookie,
      memo: canaries.memo,
      body: canaries.jobBody,
    } as never);

    expect(info).toHaveBeenCalledTimes(1);
    const serialized = String(info.mock.calls[0][0]);
    expect(() => JSON.parse(serialized)).not.toThrow();
    expectNoCanary(serialized);
  });

  it("returns and logs a generic health failure when dependency configuration and errors contain canaries", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", canaries.databaseUrl);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", canaries.apiKey);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetcher = vi.fn().mockRejectedValue(new Error(
      [canaries.bearer, canaries.cookie, canaries.memo, canaries.jobBody].join(" "),
    ));
    vi.stubGlobal("fetch", fetcher);

    const response = await healthCheck(new Request("https://jobs.invalid/api/health", {
      headers: { "x-request-id": "request_health_canary" },
    }));
    const responseText = await response.text();
    const logText = info.mock.calls.flat().join("\n");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(503);
    expect(JSON.parse(responseText)).toMatchObject({
      status: "unavailable",
      database: "unavailable",
    });
    expectNoCanary(responseText + "\n" + logText);
  });

  it("does not echo an invalid destructive request body into its error response or audit log", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_BYPASS_AUTH", "true");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const body = JSON.stringify({
      confirmation: canaries.memo,
      exportAcknowledged: false,
      authorization: canaries.bearer,
      cookie: canaries.cookie,
      apiKey: canaries.apiKey,
      jobBody: canaries.jobBody,
    });

    const response = await deleteAccount(new Request("https://jobs.invalid/api/account", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        origin: "https://jobs.invalid",
        "x-request-id": "request_delete_canary",
      },
      body,
    }));
    const responseText = await response.text();
    const logText = info.mock.calls.flat().join("\n");

    expect(response.status).toBe(400);
    expect(JSON.parse(responseText)).toMatchObject({
      code: "INVALID_CONFIRMATION",
      requestId: "request_delete_canary",
    });
    expectNoCanary(responseText + "\n" + logText);
  });
});
