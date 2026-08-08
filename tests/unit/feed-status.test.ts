import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeedStatus, latestEnabledSuccess } from "@/components/feed-status";
import { makeDiscoveryFeedFixture } from "@/lib/e2e/discovery-feed";
import { parseFeedQuery } from "@/lib/validation/feed";

function feed(overrides: { health: "partial" | "failed"; cached: boolean }) {
  return {
    ...makeDiscoveryFeedFixture("failed-cached", parseFeedQuery({})),
    query: parseFeedQuery({}),
    ...overrides,
  };
}

describe("feed status", () => {
  it("uses success timestamps from enabled providers only", () => {
    const value = feed({ health: "partial", cached: true });
    value.providerHealth[0].enabled = true;
    value.providerHealth[0].lastSuccessAt = "2026-08-08T10:00:00+09:00";
    value.providerHealth[1].enabled = false;
    value.providerHealth[1].lastSuccessAt = "2026-08-08T20:00:00+09:00";
    expect(latestEnabledSuccess(value)).toBe("2026-08-08T10:00:00+09:00");
  });

  it("distinguishes cached and unavailable failed feeds", () => {
    const cached = renderToStaticMarkup(createElement(FeedStatus, { feed: feed({ health: "failed", cached: true }) }));
    expect(cached).toContain("마지막으로 확인된 공고를 표시합니다");

    const unavailable = renderToStaticMarkup(createElement(FeedStatus, { feed: feed({ health: "failed", cached: false }) }));
    expect(unavailable).toContain("현재 표시할 공고가 없습니다");
    expect(unavailable).toContain("다시 시도");
    expect(unavailable).not.toContain("마지막으로 확인된 공고를 표시합니다");
  });

  it("does not claim uncached partial results are cached", () => {
    const html = renderToStaticMarkup(createElement(FeedStatus, { feed: feed({ health: "partial", cached: false }) }));
    expect(html).not.toContain("이전에 확인한 공고를 함께 표시합니다");
  });
});