"use client";

import { useEffect, useState } from "react";

type Status = "active" | "closed" | "unreachable" | "unsupported" | "unknown" | "checking";

const labels: Record<Status, string> = {
  active: "원문 정상",
  closed: "원문 마감 또는 종료",
  unreachable: "원문 확인 실패",
  unsupported: "자동 확인 미지원",
  unknown: "원문 상태 알 수 없음",
  checking: "원문 확인 중",
};

export function SourceStatus({
  jobId,
  source,
}: {
  jobId: string;
  source: { id: string; status: Exclude<Status, "checking">; lastSuccessAt: string | null };
}) {
  const [state, setState] = useState<{
    status: Status;
    lastSuccessAt: string | null;
    cached: boolean;
  }>({ status: "checking", lastSuccessAt: source.lastSuccessAt, cached: false });

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch(`/api/jobs/${jobId}/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceId: source.id }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("refresh failed");
        const result = await response.json();
        setState({
          status: result.status,
          lastSuccessAt: result.lastSuccessAt,
          cached: Boolean(result.cached),
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setState({ status: "unreachable", lastSuccessAt: source.lastSuccessAt, cached: false });
        }
      }
    }
    void refresh();
    return () => controller.abort();
  }, [jobId, source.id, source.lastSuccessAt]);

  return (
    <div className="source-status" role="status" aria-live="polite">
      <strong>{labels[state.status]}</strong>
      {state.cached && <span className="muted"> · 캐시 사용</span>}
      {state.lastSuccessAt && <small className="muted">마지막 성공: {new Date(state.lastSuccessAt).toLocaleString("ko-KR")}</small>}
    </div>
  );
}