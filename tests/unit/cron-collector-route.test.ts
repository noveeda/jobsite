import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  collectCatalog: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/collection/collect", () => ({ collectCatalog: mocks.collectCatalog }));

import { POST } from "@/app/api/cron/collect/route";

const cronSecret = "cron-secret-canary-123456";

function configure(overrides: Record<string, string | undefined> = {}) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
  vi.stubEnv("AUTOMATIC_DISCOVERY_ENABLED", "true");
  vi.stubEnv("COLLECTOR_ENABLED", "true");
  vi.stubEnv("CRON_SECRET", cronSecret);
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value ?? "");
}

function request(options: { method?: string; authorization?: string; body?: unknown } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.authorization !== undefined) headers.set("authorization", options.authorization);
  const method = options.method ?? "POST";
  return new Request("https://jobs.example.com/api/cron/collect", {
    method,
    headers,
    ...(method === "GET" || method === "HEAD" ? {} : { body: JSON.stringify(options.body ?? { reason: "scheduled" }) }),
  });
}

function expectNoPrivilegedCalls() {
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
  expect(mocks.collectCatalog).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  configure();
  mocks.createAdminClient.mockReturnValue({ kind: "admin-client" });
  mocks.collectCatalog.mockResolvedValue({ runs: [], claimFailures: [] });
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/cron/collect", () => {
  it.each([
    ["missing authorization", undefined],
    ["wrong bearer", "Bearer wrong-secret"],
    ["wrong scheme", cronSecret],
  ])("returns 401 for %s before any privileged call", async (_case, authorization) => {
    const response = await POST(request({ authorization }));

    expect(response.status).toBe(401);
    expectNoPrivilegedCalls();
    expect(await response.text()).not.toContain(cronSecret);
  });

  it.each([
    ["collector disabled", { COLLECTOR_ENABLED: "false" }],
    ["discovery disabled", { AUTOMATIC_DISCOVERY_ENABLED: "false" }],
    ["server cron secret missing", { CRON_SECRET: undefined }],
  ])("returns 503 for %s before any privileged call", async (_case, overrides) => {
    configure(overrides);
    const response = await POST(request({ authorization: `Bearer ${cronSecret}` }));

    expect(response.status).toBe(503);
    expectNoPrivilegedCalls();
    expect(await response.text()).not.toContain(cronSecret);
  });

  it("returns 405 for an unsupported method before any privileged call", async () => {
    const response = await POST(request({ method: "GET", authorization: `Bearer ${cronSecret}` }));

    expect(response.status).toBe(405);
    expectNoPrivilegedCalls();
  });

  it("delegates one authenticated collection without exposing the secret", async () => {
    const response = await POST(request({
      authorization: `Bearer ${cronSecret}`,
      body: { provider: "alpha", reason: "scheduled" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
    expect(mocks.collectCatalog).toHaveBeenCalledOnce();
    expect(await response.text()).not.toContain(cronSecret);
  });

  it("returns bounded claim-failure details and logs a stable partial failure", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.collectCatalog.mockResolvedValue({ runs: [], claimFailures: ["fixture-page"] });
    try {
      const response = await POST(request({ authorization: `Bearer ${cronSecret}` }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        claimFailureCount: 1,
        claimFailures: ["fixture-page"],
      });
      expect(log).toHaveBeenCalledWith(expect.stringContaining("COLLECTION_CLAIM_PARTIAL"));
      expect(JSON.stringify(log.mock.calls)).not.toContain(cronSecret);
    } finally {
      log.mockRestore();
    }
  });

  it("returns 500 when every due provider claim fails", async () => {
    mocks.collectCatalog.mockRejectedValue(new Error("COLLECTION_CLAIM_FAILED"));

    const response = await POST(request({ authorization: `Bearer ${cronSecret}` }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "COLLECTION_FAILED" });
  });
});
