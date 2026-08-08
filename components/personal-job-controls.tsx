"use client";

import { useActionState, useRef, useState, useSyncExternalStore } from "react";

import {
  setPersonalJobExcluded,
  setPersonalJobSaved,
  updatePersonalJobTracking,
} from "@/app/(dashboard)/jobs/personal-actions";
import type { PersonalApplicationStatus } from "@/lib/validation/personal-job-state";

export type PersonalStateView = {
  saved: boolean;
  excluded: boolean;
  applicationStatus: PersonalApplicationStatus;
  memo?: string;
  nextActionAt: string | null;
};

const statuses: readonly [PersonalApplicationStatus, string][] = [
  ["unreviewed", "검토 전"],
  ["planned", "지원 예정"],
  ["applied", "지원 완료"],
  ["interviewing", "전형 진행"],
  ["offered", "합격 제안"],
  ["rejected", "불합격"],
  ["withdrawn", "지원 철회"],
];

const subscribeToHydration = () => () => {};

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ToggleButton({
  canonicalJobId,
  kind,
  current,
  accessibleLabel,
}: {
  canonicalJobId: string;
  kind: "saved" | "excluded";
  current: boolean;
  accessibleLabel?: string;
}) {
  const action = kind === "saved" ? setPersonalJobSaved : setPersonalJobExcluded;
  const [state, formAction, pending] = useActionState(action, null);
  const [submittedValue, setSubmittedValue] = useState<boolean | null>(null);
  const next = !current;
  const label = kind === "saved"
    ? current ? "저장 취소" : "공고 저장"
    : current ? "제외 취소" : "공고 제외";
  const successValue = submittedValue ?? next;
  const success = kind === "saved"
    ? successValue ? "저장했습니다." : "저장을 취소했습니다."
    : successValue ? "제외했습니다." : "제외를 취소했습니다.";

  return (
    <form action={formAction} className="stack" onSubmit={() => setSubmittedValue(next)}>
      <input type="hidden" name="canonicalJobId" value={canonicalJobId} />
      <input type="hidden" name="value" value={String(next)} />
      <button aria-label={accessibleLabel} className="button secondary touch-target" disabled={pending}>
        {pending ? "처리 중" : label}
      </button>
      {state?.ok === false && <p className="error" role="alert">{state.message}</p>}
      {state?.ok === true && <p role="status">{success}</p>}
    </form>
  );
}

export function PersonalListControls({
  canonicalJobId,
  jobTitle,
  state,
}: {
  canonicalJobId: string;
  jobTitle: string;
  state: PersonalStateView;
}) {
  return (
    <div className="row personal-state-summary">
      {state.saved && <span className="badge">저장됨</span>}
      {state.applicationStatus !== "unreviewed" && (
        <span className="badge">{statuses.find(([value]) => value === state.applicationStatus)?.[1]}</span>
      )}
      <ToggleButton
        accessibleLabel={`${jobTitle} ${state.excluded ? "제외 취소" : "공고 제외"}`}
        canonicalJobId={canonicalJobId}
        kind="excluded"
        current={state.excluded}
      />
    </div>
  );
}

export function PersonalJobControls({
  canonicalJobId,
  state,
}: {
  canonicalJobId: string;
  state: PersonalStateView;
}) {
  const [trackingState, trackingAction, pending] = useActionState(updatePersonalJobTracking, null);
  const [applicationStatus, setApplicationStatus] = useState(state.applicationStatus);
  const [memo, setMemo] = useState(state.memo ?? "");
  const [editedNextActionAt, setEditedNextActionAt] = useState<string | null>(null);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const nextActionAt = editedNextActionAt ?? (hydrated ? localDateTime(state.nextActionAt) : "");
  const [offlineFailure, setOfflineFailure] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const nextActionUtcRef = useRef<HTMLInputElement>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    const localInput = event.currentTarget.elements.namedItem("nextActionAtLocal") as HTMLInputElement | null;
    if (nextActionUtcRef.current) {
      nextActionUtcRef.current.value = localInput?.value ? new Date(localInput.value).toISOString() : "";
    }
    if (navigator.onLine) {
      setOfflineFailure(false);
      return;
    }
    event.preventDefault();
    setOfflineFailure(true);
  }

  const failed = offlineFailure || trackingState?.ok === false;
  return (
    <section className="card stack" aria-labelledby="personal-state-heading">
      <h2 id="personal-state-heading">내 지원 관리</h2>
      <div className="row">
        <ToggleButton canonicalJobId={canonicalJobId} kind="saved" current={state.saved} />
        <ToggleButton canonicalJobId={canonicalJobId} kind="excluded" current={state.excluded} />
      </div>
      <form ref={formRef} action={trackingAction} className="stack" onSubmit={submit}>
        <input type="hidden" name="canonicalJobId" value={canonicalJobId} />
        <input
          ref={nextActionUtcRef}
          type="hidden"
          name="nextActionAt"
        />
        <label>지원 상태
          <select
            disabled={!hydrated}
            name="applicationStatus"
            value={applicationStatus}
            onChange={(event) => setApplicationStatus(event.target.value as PersonalApplicationStatus)}
          >
            {statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>메모
          <textarea disabled={!hydrated} name="memo" maxLength={10_000} value={memo} onChange={(event) => setMemo(event.target.value)} />
        </label>
        <label>다음 행동
          <input
            name="nextActionAtLocal"
            type="datetime-local"
            disabled={!hydrated}
            value={nextActionAt}
            onInput={(event) => setEditedNextActionAt(event.currentTarget.value)}
          />
        </label>
        <button className="button touch-target" disabled={pending || !hydrated}>
          {pending ? "저장 중" : "지원 정보 저장"}
        </button>
        {failed && (
          <p className="error" role="alert">
            {trackingState?.ok === false ? trackingState.message : "저장하지 못했습니다. 연결 후 다시 시도해 주세요."}{" "}
            <button className="link-button touch-target" type="button" onClick={() => formRef.current?.requestSubmit()}>
              다시 시도
            </button>
          </p>
        )}
        {trackingState?.ok === true && <p role="status">저장했습니다.</p>}
      </form>
    </section>
  );
}
