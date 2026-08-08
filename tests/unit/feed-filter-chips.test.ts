import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppliedFeedFilters, appliedFeedFilters } from "@/components/filters";
import { parseFeedQuery } from "@/lib/validation/feed";

describe("applied feed filter chips", () => {
  it("uses normalized values and removes exactly one filter while resetting take", () => {
    const values = parseFeedQuery({
      q: "  백엔드   개발자 ",
      region: "서울",
      role: "backend",
      sort: "deadline",
      take: "60",
    });
    const chips = appliedFeedFilters(values);
    const region = chips.find((chip) => chip.key === "region");

    expect(chips.map(({ key }) => key)).toEqual(["q", "region", "role", "sort"]);
    expect(chips[0].value).toBe("백엔드 개발자");
    expect(region?.href).toContain("q=%EB%B0%B1%EC%97%94%EB%93%9C+%EA%B0%9C%EB%B0%9C%EC%9E%90");
    expect(region?.href).toContain("role=backend");
    expect(region?.href).toContain("sort=deadline");
    expect(region?.href).not.toContain("region=");
    expect(region?.href).not.toContain("take=");
  });

  it("renders one shared GET-link chip list with touch targets", () => {
    const html = renderToStaticMarkup(
      createElement(AppliedFeedFilters, { values: parseFeedQuery({ q: "개발자", region: "서울" }) }),
    );
    expect(html).toContain('aria-label="적용된 필터"');
    expect(html.match(/class="filter-chip touch-target"/g)).toHaveLength(2);
    expect(html).toContain("/jobs?region=%EC%84%9C%EC%9A%B8");
  });
});