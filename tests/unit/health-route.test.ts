import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health route", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a bounded healthy response without configuration values", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://secret-project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "secret-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const response = await GET(new Request("https://jobs.example.com/api/health"));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ status: "ok", database: "ok" });
    expect(text).not.toMatch(/secret-project|secret-key|supabase\.co/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("maps dependency failure to one generic unavailable response", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://secret-project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "secret-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection string secret")));
    const response = await GET(new Request("https://jobs.example.com/api/health"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "unavailable", database: "unavailable" });
  });
});
