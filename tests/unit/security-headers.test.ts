import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("global security headers", () => {
  it("sets browser hardening without server values", async () => {
    const entries = await nextConfig.headers?.();
    const headers = Object.fromEntries((entries?.[0].headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]));
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toMatch(/camera=\(\)/);
    expect(headers["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
    expect(JSON.stringify(headers)).not.toMatch(/SUPABASE|SERVICE_ROLE|API_KEY/);
  });
});
