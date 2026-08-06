import { describe, expect, it, vi } from "vitest";
import { refreshSource, type RefreshSourceInput } from "@/lib/sources/connector";
import { createDailyBudget } from "@/lib/sources/saramin";

const now = new Date("2026-08-07T10:00:00Z");
const base: RefreshSourceInput = {
  job: {
    title: "사용자 제목",
    companyName: "기존 회사",
    roleName: null,
    locations: [],
    deadlineAt: null,
    deadlineKind: "unknown",
    fieldProvenance: { title: { origin: "user" }, companyName: { origin: "source" } },
  },
  source: {
    id: "10000000-0000-4000-8000-000000000001",
    provider: "saramin",
    connectorMode: "approved_api",
    externalId: "123",
    originalUrl: "https://www.saramin.co.kr/job/123",
    status: "unknown",
    lastCheckedAt: null,
    lastSuccessAt: null,
  },
};

describe("source refresh orchestration", () => {
  it("uses a 30-minute cached result without provider or persistence calls", async () => {
    const call = vi.fn();
    const persist = vi.fn();
    const result = await refreshSource({
      ...base,
      source: { ...base.source, lastCheckedAt: "2026-08-07T09:30:01Z" },
    }, { now: () => now, providerCall: call, persist });
    expect(result.cached).toBe(true);
    expect(call).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("never overwrites a user-origin field but applies changed source fields", async () => {
    const persist = vi.fn();
    const result = await refreshSource(base, {
      now: () => now,
      providerEnabled: () => true,
      providerCall: vi.fn().mockResolvedValue({
        provider: "saramin",
        externalId: "123",
        originalUrl: base.source.originalUrl,
        observedAt: now.toISOString(),
        status: "active",
        values: { title: "출처 제목", companyName: "새 회사" },
        provenance: {},
      }),
      persist,
    });
    expect(result.job.title).toBe("사용자 제목");
    expect(result.job.companyName).toBe("새 회사");
    expect(result.changedFields).toEqual(["companyName"]);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      jobPatch: { companyName: "새 회사" },
      errorCode: null,
    }));
  });

  it.each([
    [{ ...base.source, connectorMode: "manual" as const }, "manual"],
    [{ ...base.source, provider: "other" as const, connectorMode: "manual" as const }, "unsupported"],
  ])("does not call providers for %s sources", async (source) => {
    const call = vi.fn();
    const result = await refreshSource({ ...base, source }, { now: () => now, providerCall: call, persist: vi.fn() });
    expect(result.status).toBe("unsupported");
    expect(call).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected provider failures before persistence and response", async () => {
    const persist = vi.fn();
    const result = await refreshSource(base, {
      now: () => now,
      providerEnabled: () => true,
      providerCall: vi.fn().mockRejectedValue(new Error("secret credential and raw body")),
      persist,
    });
    expect(result).toMatchObject({ status: "unreachable", errorCode: "SOURCE_UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain("secret credential");
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "SOURCE_UNAVAILABLE" }));
  });

  it("enforces the Saramin daily budget and resets on a new UTC day", () => {
    const budget = createDailyBudget(2);
    expect(budget.consume(new Date("2026-08-07T00:00:00Z"))).toBe(true);
    expect(budget.consume(new Date("2026-08-07T23:59:59Z"))).toBe(true);
    expect(budget.consume(new Date("2026-08-07T23:59:59Z"))).toBe(false);
    expect(budget.consume(new Date("2026-08-08T00:00:00Z"))).toBe(true);
  });
});