"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  mergeCatalogDuplicate,
  reportCatalogDuplicateIssue,
  separateCatalogDuplicate,
  undoCatalogDuplicate,
  type CatalogDuplicateActionState,
} from "@/app/(dashboard)/jobs/catalog-duplicate-actions";
import {
  catalogDuplicateControlState,
  type CatalogDuplicateConflict,
} from "@/lib/domain/catalog-duplicate-control";
import type { CatalogDuplicateDetail } from "@/lib/validation/feed";
import { ProviderAttribution } from "@/components/provider-attribution";

type Candidate = CatalogDuplicateDetail["candidates"][number] & {
  subjectId: string;
  active?: boolean;
};

type DecisionAction = typeof mergeCatalogDuplicate | typeof separateCatalogDuplicate | typeof undoCatalogDuplicate;

function setOperationId(input: HTMLInputElement | null) {
  if (input && !input.value) input.value = crypto.randomUUID();
}

function ActionFeedback({ state }: { state: CatalogDuplicateActionState }) {
  if (state?.ok === true) return <p role="status">{state.replayed ? "이전 요청 결과를 다시 확인했습니다." : "변경했습니다."}</p>;
  if (state?.ok === false && !("blockingEdges" in state)) return <p className="error" role="alert">{state.message}</p>;
  return null;
}

function DecisionForm({
  action,
  actionKind,
  candidate,
  catalogJobId,
  disabled,
  onConflict,
}: {
  action: DecisionAction;
  actionKind: "merge" | "separate" | "undo";
  candidate: Candidate;
  catalogJobId: string;
  disabled: boolean;
  onConflict: (conflict: CatalogDuplicateConflict | null) => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const operationIdRef = useRef<HTMLInputElement>(null);
  const labels = {
    merge: "병합",
    separate: "별개로 유지",
    undo: "마지막 결정 되돌리기",
  } as const;

  useEffect(() => {
    if (state?.ok === false && "blockingEdges" in state) {
      onConflict({ code: state.code, blockingEdges: state.blockingEdges });
    }
  }, [onConflict, state]);

  return (
    <form action={formAction} onSubmit={() => setOperationId(operationIdRef.current)}>
      <input type="hidden" name="catalogJobId" value={catalogJobId} />
      <input type="hidden" name="candidateId" value={candidate.id} />
      <input ref={operationIdRef} type="hidden" name="operationId" defaultValue="" />
      <input type="hidden" name="expectedRevision" value={candidate.currentUser.revision} />
      <button
        aria-label={`${candidate.counterpartId} 공고와 ${labels[actionKind]}`}
        className="button secondary touch-target"
        disabled={disabled || pending}
      >
        {pending ? "처리 중" : labels[actionKind]}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function IssueReportForm({ candidate, catalogJobId, disabled }: { candidate: Candidate; catalogJobId: string; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(reportCatalogDuplicateIssue, null);
  const operationIdRef = useRef<HTMLInputElement>(null);
  const categoryId = `duplicate-report-category-${candidate.id}`;
  const messageId = `duplicate-report-message-${candidate.id}`;
  return (
    <form action={formAction} className="stack" onSubmit={() => setOperationId(operationIdRef.current)}>
      <input type="hidden" name="catalogJobId" value={catalogJobId} />
      <input type="hidden" name="candidateId" value={candidate.id} />
      <input ref={operationIdRef} type="hidden" name="operationId" defaultValue="" />
      <label htmlFor={categoryId}>{candidate.counterpartId} 공고 문제 유형
        <select id={categoryId} name="category" defaultValue="incorrect_value" disabled={disabled}>
          <option value="incorrect_value">잘못된 값</option>
          <option value="duplicate">중복 판단</option>
          <option value="broken_link">원문 링크</option>
          <option value="attribution">출처 표기</option>
          <option value="other">기타</option>
        </select>
      </label>
      <label htmlFor={messageId}>{candidate.counterpartId} 공고 문제 내용
        <textarea id={messageId} name="message" maxLength={2_000} required disabled={disabled} />
      </label>
      <button aria-label={`${candidate.counterpartId} 공고 문제 신고`} className="button secondary touch-target" disabled={disabled || pending}>
        {pending ? "신고 중" : "문제 신고"}
      </button>
      {state?.ok === true && <p role="status">{state.replayed ? "이전 신고를 다시 확인했습니다." : "신고를 접수했습니다."}</p>}
      {state?.ok === false && <p className="error" role="alert">{state.message}</p>}
    </form>
  );
}

function CandidatePanel({ candidate, allCandidates }: { candidate: Candidate; allCandidates: Candidate[] }) {
  const [conflict, setConflict] = useState<CatalogDuplicateConflict | null>(null);
  const state = catalogDuplicateControlState({
    decision: candidate.currentUser.decision,
    active: candidate.active !== false,
    conflict,
  });
  const blockers = state.blockingEdges
    .map((id) => allCandidates.find((other) => other.id === id))
    .filter((item): item is Candidate => Boolean(item));

  return (
    <article className="card stack catalog-duplicate-candidate" aria-labelledby={`duplicate-${candidate.id}`}>
      <div className="stack">
        <h2 id={`duplicate-${candidate.id}`}>유사 공고 후보</h2>
        <p><strong>{state.label}</strong> · 유사도 {Math.round(candidate.score * 100)}%</p>
        <p>판단 근거: {candidate.reasons.join(", ")}</p>
        <Link className="touch-target" href={`/jobs/${candidate.counterpartId}`}>상대 공고 보기</Link>
      </div>

      {candidate.active === false ? <p className="muted">이 사실 기반 제안은 더 이상 활성 상태가 아닙니다. 이전 판단 이력만 보존됩니다.</p> : (
        <div className="row catalog-duplicate-actions">
          {state.canMerge && <DecisionForm action={mergeCatalogDuplicate} actionKind="merge" candidate={candidate} catalogJobId={candidate.subjectId} disabled={false} onConflict={setConflict} />}
          {state.canSeparate && <DecisionForm action={separateCatalogDuplicate} actionKind="separate" candidate={candidate} catalogJobId={candidate.subjectId} disabled={false} onConflict={setConflict} />}
          {state.canUndo && <DecisionForm action={undoCatalogDuplicate} actionKind="undo" candidate={candidate} catalogJobId={candidate.subjectId} disabled={false} onConflict={setConflict} />}
        </div>
      )}

      {state.blocked && (
        <section className="warning-card stack" aria-label="결정 차단 안내">
          <p className="error">{conflict?.code === "COMPONENT_LIMIT" ? "안전 한도 때문에 요청이 적용되지 않았습니다." : "요청은 적용되지 않았습니다. 아래 차단 결정을 먼저 되돌린 뒤 원래 요청을 직접 다시 시도해 주세요."}</p>
          {blockers.length > 0 ? blockers.map((blocker) => (
            <div className="row" key={blocker.id}>
              <span>차단 결정 {blocker.id}</span>
              <Link className="touch-target" href={`/jobs/${blocker.subjectId}`}>관련 공고 보기</Link>
              <DecisionForm action={undoCatalogDuplicate} actionKind="undo" candidate={blocker} catalogJobId={blocker.subjectId} disabled={false} onConflict={setConflict} />
            </div>
          )) : <p className="muted">차단 결정 ID: {state.blockingEdges.join(", ")}</p>}
        </section>
      )}

      <section className="stack" aria-labelledby={`sources-${candidate.id}`}>
        <h3 id={`sources-${candidate.id}`}>원문 출처</h3>
        {candidate.sources.map((source) => (
          <div className="stack source-attribution" key={`${source.provider}:${source.originalUrl}`}>
            <ProviderAttribution provider={source.provider} providerLabel={source.providerName} connectorMode="manual" originalUrl={source.originalUrl} />
            <p className="muted">관찰 시각 {new Date(source.observedAt).toLocaleString("ko-KR")}</p>
          </div>
        ))}
      </section>

      {candidate.conflicts.length > 0 && (
        <section className="stack" aria-labelledby={`conflicts-${candidate.id}`}>
          <h3 id={`conflicts-${candidate.id}`}>출처 간 다른 정보</h3>
          {candidate.conflicts.map((conflictValue) => (
            <div className="duplicate-conflict" key={conflictValue.field}>
              <strong>{conflictValue.field === "deadlineAt" ? "마감일" : "근무 지역"}</strong>
              <ul>{conflictValue.values.map((value) => <li key={`${value.provider}:${value.observedAt}`}>{value.provider}: {value.value ?? "정보 없음"} · {new Date(value.observedAt).toLocaleString("ko-KR")}</li>)}</ul>
            </div>
          ))}
        </section>
      )}

      <section className="stack" aria-labelledby={`history-${candidate.id}`}>
        <h3 id={`history-${candidate.id}`}>내 판단 이력</h3>
        {candidate.currentUser.history.length === 0 ? <p className="muted">아직 판단 이력이 없습니다.</p> : <ol>{candidate.currentUser.history.map((event, index) => <li key={`${event.createdAt}:${index}`}>{event.action} · {new Date(event.createdAt).toLocaleString("ko-KR")}</li>)}</ol>}
        {state.canReport && <IssueReportForm candidate={candidate} catalogJobId={candidate.subjectId} disabled={false} />}
      </section>

      <section className="stack" aria-labelledby={`members-${candidate.id}`}>
        <h3 id={`members-${candidate.id}`}>연결된 공고</h3>
        <div className="row">{candidate.group.memberIds.map((memberId) => <Link className="touch-target" href={`/jobs/${memberId}`} key={memberId}>공고 {memberId}</Link>)}</div>
      </section>
    </article>
  );
}

export function CatalogDuplicatePanel({ candidates }: { candidates: Candidate[] }) {
  if (candidates.length === 0) return null;
  return <section className="stack" aria-label="자동 중복 공고 판단">{candidates.map((candidate) => <CandidatePanel key={`${candidate.id}:${candidate.subjectId}`} candidate={candidate} allCandidates={candidates} />)}</section>;
}
