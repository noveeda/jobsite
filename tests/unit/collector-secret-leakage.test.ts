import { afterEach, describe, expect, it, vi } from "vitest";

import { logSafeEvent, toSafeEvent } from "@/lib/observability/safe-logger";

const accessKey = "collector-access-key-canary-91e6";
const bearer = "collector-bearer-canary-e27a";
const sourceUrl = `https://oapi.saramin.co.kr/job-search?access-key=${accessKey}&keywords=backend`;

function expectRedacted(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  expect(text).not.toContain(accessKey);
  expect(text).not.toContain(bearer);
  expect(text).not.toMatch(/[?&](?:access[-_]?key|api[-_]?key|token|authorization)=/i);
}

afterEach(() => vi.restoreAllMocks());

describe("collector log redaction", () => {
  it("drops URLs, provider errors, request headers, and raw bodies outside the event allowlist", () => {
    const event = toSafeEvent({
      category: "collector.fetch",
      outcome: "failure",
      errorCode: "SOURCE_UNAVAILABLE",
      url: sourceUrl,
      authorization: `Bearer ${bearer}`,
      error: new Error(`provider failed at ${sourceUrl} with ${bearer}`),
      responseBody: { accessKey, jobs: ["raw"] },
    } as never);

    expect(event).toMatchObject({ category: "collector.fetch", errorCode: "SOURCE_UNAVAILABLE" });
    expectRedacted(event);
  });

  it("redacts secrets when untrusted URL and error text reaches log-safe string fields", () => {
    const event = toSafeEvent({
      category: `collector.fetch ${sourceUrl}`,
      outcome: "failure",
      errorCode: String(new Error(`SOURCE_UNAVAILABLE authorization=Bearer ${bearer}`)),
    });

    expectRedacted(event);
  });

  it.each([
    ["accessKey:camel-canary", "camel-canary"],
    ["api_key=snake-canary", "snake-canary"],
    ["client-secret:kebab-canary", "kebab-canary"],
    ['{"refreshToken":"json-canary"}', "json-canary"],
    ["authorization:Bearer colon-bearer-canary", "colon-bearer-canary"],
  ])("redacts assignment and JSON spelling: %s", (label, secret) => {
    const event = toSafeEvent({ category: label, outcome: "failure", errorCode: label });
    const serialized = JSON.stringify(event);

    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain(secret);
  });

  it("never writes collector query credentials or provider error secrets", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logSafeEvent({
      category: `collector.fetch ${sourceUrl}`,
      outcome: "failure",
      errorCode: `SOURCE_AUTH_INVALID secret=${bearer}`,
    });

    expect(info).toHaveBeenCalledTimes(1);
    expectRedacted(String(info.mock.calls[0][0]));
  });
});
