export type AttributionProvider = "manual" | "saramin" | "jobkorea" | "other";
export type AttributionConnectorMode = "manual" | "approved_api";

export type AttributionDecision =
  | { kind: "saramin_approved"; manualLabel: null }
  | { kind: "manual"; manualLabel: string };

const MANUAL_LABELS: Record<AttributionProvider, string> = {
  manual: "직접 등록 · 수동 입력",
  saramin: "사람인 · 수동 입력",
  jobkorea: "잡코리아 · 수동 입력",
  other: "외부 공고 · 수동 입력",
};

export const SOURCE_PRIORITY_NOTICE = "저장된 정보는 원문을 대체하지 않습니다.";
export const NO_AFFILIATION_NOTICE = "본 서비스는 해당 채용 플랫폼과 제휴 관계가 아닙니다.";

export function decideProviderAttribution(
  provider: AttributionProvider,
  connectorMode: AttributionConnectorMode,
): AttributionDecision {
  if (provider === "saramin" && connectorMode === "approved_api") {
    return { kind: "saramin_approved", manualLabel: null };
  }
  return { kind: "manual", manualLabel: MANUAL_LABELS[provider] };
}

function safeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function ProviderAttribution({
  provider,
  connectorMode,
  originalUrl,
}: {
  provider: AttributionProvider;
  connectorMode: AttributionConnectorMode;
  originalUrl: string;
}) {
  const decision = decideProviderAttribution(provider, connectorMode);
  const sourceUrl = safeHttpsUrl(originalUrl);

  return (
    <aside className="stack source-attribution" aria-label="출처 안내">
      <div className="row">
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="원문 보기 · 원문 확인">원문 보기</a>
        ) : (
          <span>원문 링크를 확인할 수 없음</span>
        )}
        {decision.kind === "saramin_approved" ? (
          <a href="https://www.saramin.co.kr" target="_blank" rel="noopener noreferrer">
            Powered by 취업 사람인
          </a>
        ) : (
          <span>{decision.manualLabel}</span>
        )}
      </div>
      <p className="muted">{SOURCE_PRIORITY_NOTICE} {NO_AFFILIATION_NOTICE}</p>
    </aside>
  );
}
