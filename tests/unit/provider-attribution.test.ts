import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  NO_AFFILIATION_NOTICE,
  ProviderAttribution,
  SOURCE_PRIORITY_NOTICE,
  decideProviderAttribution,
  type AttributionConnectorMode,
  type AttributionProvider,
} from "@/components/provider-attribution";

describe("provider attribution decision", () => {
  it.each([
    ["saramin", "approved_api", "saramin_approved", null],
    ["saramin", "manual", "manual", "사람인 · 수동 입력"],
    ["jobkorea", "approved_api", "manual", "잡코리아 · 수동 입력"],
    ["jobkorea", "manual", "manual", "잡코리아 · 수동 입력"],
    ["manual", "approved_api", "manual", "직접 등록 · 수동 입력"],
    ["manual", "manual", "manual", "직접 등록 · 수동 입력"],
    ["other", "approved_api", "manual", "외부 공고 · 수동 입력"],
    ["other", "manual", "manual", "외부 공고 · 수동 입력"],
  ] as const)("maps %s/%s without implying an unsupported integration", (provider, mode, kind, label) => {
    expect(decideProviderAttribution(provider, mode)).toEqual({ kind, manualLabel: label });
  });
});

function markup(provider: AttributionProvider, connectorMode: AttributionConnectorMode, originalUrl = "https://example.com/job/1") {
  return renderToStaticMarkup(createElement(ProviderAttribution, { provider, connectorMode, originalUrl }));
}

describe("ProviderAttribution", () => {
  it("renders the original source first and the exact approved Saramin attribution", () => {
    const html = markup("saramin", "approved_api", "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=1");

    expect(html.indexOf("원문 보기")).toBeLessThan(html.indexOf("Powered by 취업 사람인"));
    expect(html).toContain('href="https://www.saramin.co.kr"');
    expect(html).toContain('target="_blank"');
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(html).toContain("Powered by 취업 사람인");
    expect(html).not.toContain("수동 입력");
  });

  it.each([
    ["saramin", "manual", "사람인 · 수동 입력"],
    ["jobkorea", "approved_api", "잡코리아 · 수동 입력"],
    ["other", "manual", "외부 공고 · 수동 입력"],
  ] as const)("renders a manual label for %s/%s", (provider, mode, label) => {
    const html = markup(provider, mode);

    expect(html).toContain(label);
    expect(html).not.toContain("Powered by 취업 사람인");
  });

  it("always explains source priority and non-affiliation", () => {
    const html = markup("saramin", "approved_api");

    expect(html).toContain(SOURCE_PRIORITY_NOTICE);
    expect(html).toContain(NO_AFFILIATION_NOTICE);
  });

  it("does not emit an unsafe non-HTTPS original-source link", () => {
    const html = markup("other", "manual", "javascript:alert(1)");

    expect(html).toContain("원문 링크를 확인할 수 없음");
    expect(html).not.toContain("javascript:");
  });
});
