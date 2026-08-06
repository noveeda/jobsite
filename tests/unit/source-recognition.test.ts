import { describe, expect, it } from "vitest";
import { recognizeSource } from "@/lib/sources/connector";

describe("source recognition", () => {
  it("recognizes supported HTTPS URLs without fetching", () => {
    expect(recognizeSource("https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123")).toMatchObject({ provider: "saramin", externalId: "123" });
    expect(recognizeSource("https://www.jobkorea.co.kr/Recruit/GI_Read/456")).toMatchObject({ provider: "jobkorea", externalId: "456" });
  });
  it("uses manual mode for other HTTPS URLs and rejects HTTP", () => {
    expect(recognizeSource("https://www.jobplanet.co.kr/job/1").provider).toBe("other");
    expect(() => recognizeSource("http://example.com/job")).toThrow("HTTPS");
  });
});
