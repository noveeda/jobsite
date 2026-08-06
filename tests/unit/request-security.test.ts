import { describe, expect, it } from "vitest";
import { isSameOrigin, readLimitedText, RequestTooLargeError } from "@/lib/security/request";

describe("request boundaries", () => {
  it("checks mutation origins", () => {
    expect(isSameOrigin(new Request("https://jobs.example.com/api", { headers: { origin: "https://jobs.example.com" } }))).toBe(true);
    expect(isSameOrigin(new Request("https://jobs.example.com/api", { headers: { origin: "https://evil.example" } }))).toBe(false);
  });

  it("rejects declared and streamed oversized bodies", async () => {
    await expect(readLimitedText(new Request("https://jobs.example/api", { method: "POST", headers: { "content-length": "5" }, body: "12345" }), 4)).rejects.toBeInstanceOf(RequestTooLargeError);
    await expect(readLimitedText(new Request("https://jobs.example/api", { method: "POST", body: "가나다" }), 4)).rejects.toBeInstanceOf(RequestTooLargeError);
  });

  it("decodes a bounded UTF-8 body", async () => {
    await expect(readLimitedText(new Request("https://jobs.example/api", { method: "POST", body: "한글" }), 10)).resolves.toBe("한글");
  });
});
