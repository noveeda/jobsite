"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteJob, restoreRevision, updateTracking } from "@/app/(dashboard)/jobs/tracking-actions";
import { createClient } from "@/lib/supabase/client";
import { subscribeToJobDetail } from "@/lib/supabase/realtime";

const statuses = [
  ["unreviewed", "검토 전"],
  ["interested", "관심"],
  ["planned", "지원 예정"],
  ["applied", "지원 완료"],
  ["interviewing", "전형 진행"],
  ["accepted", "최종 합격"],
  ["rejected", "불합격"],
  ["excluded", "제외"],
] as const;

export type JobRevisionView = {
  id: string;
  snapshot: { applicationStatus?: string; application_status?: string; memo?: string; nextActionAt?: string | null; next_action_at?: string | null };
  changedAt: string;
  deviceId: string;
  changeKind: string;
};

type JobView = {
  id: string;
  applicationStatus: string;
  memo: string;
  nextActionAt: string | null;
  updatedAt: string;
};

export function JobDetail({
  job,
  revisions: initialRevisions,
  userId,
  testMode = false,
}: {
  job: JobView;
  revisions: JobRevisionView[];
  userId: string;
  testMode?: boolean;
}) {
  const router = useRouter();
  const [actionState, action, actionPending] = useActionState(updateTracking, null);
  const [device, setDevice] = useState("00000000-0000-4000-8000-000000000001");
  const [status, setStatus] = useState(job.applicationStatus);
  const [memo, setMemo] = useState(job.memo);
  const [nextActionAt, setNextActionAt] = useState(job.nextActionAt?.slice(0, 16) ?? "");
  const [revisions, setRevisions] = useState(initialRevisions);
  const [offline, setOffline] = useState(false);
  const [testPending, setTestPending] = useState(false);
  const [testSaved, setTestSaved] = useState(false);
  const [testError, setTestError] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const versionRef = useRef(job.updatedAt);

  function applyServerJob(value: {
    applicationStatus: string;
    memo: string;
    nextActionAt: string | null;
    updatedAt: string;
    revisions: JobRevisionView[];
  }) {
    versionRef.current = value.updatedAt;
    setStatus(value.applicationStatus);
    setMemo(value.memo);
    setNextActionAt(value.nextActionAt?.slice(0, 16) ?? "");
    setRevisions(value.revisions);
  }

  useEffect(() => {
    let id = localStorage.getItem("deviceId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("deviceId", id);
    }
    queueMicrotask(() => setDevice(id!));
  }, []);

  useEffect(() => {
    if (!testMode) {
      const supabase = createClient();
      return subscribeToJobDetail(supabase, userId, job.id, () => router.refresh());
    }
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/e2e/jobs/${job.id}`, { cache: "no-store" });
        if (!response.ok) return;
        const value = await response.json();
        if (!stopped && value.updatedAt !== versionRef.current) applyServerJob(value);
      } catch {
        // A later poll retries. Offline edits are never queued.
      }
    };
    const timer = window.setInterval(poll, 250);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [job.id, router, testMode, userId]);

  useEffect(() => {
    if (testMode) return;
    queueMicrotask(() => {
      setStatus(job.applicationStatus);
      setMemo(job.memo);
      setNextActionAt(job.nextActionAt?.slice(0, 16) ?? "");
      setRevisions(initialRevisions);
      versionRef.current = job.updatedAt;
    });
  }, [initialRevisions, job, testMode]);

  async function postTest(body: Record<string, unknown>) {
    const response = await fetch(`/api/e2e/jobs/${job.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, deviceId: device }),
    });
    if (!response.ok) throw new Error("save failed");
    const value = await response.json();
    applyServerJob(value);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    setTestSaved(false);
    if (!navigator.onLine) {
      event.preventDefault();
      setOffline(true);
      return;
    }
    setOffline(false);
    if (!testMode) return;
    event.preventDefault();
    setTestPending(true);
    setTestError(false);
    try {
      const submitted = new FormData(event.currentTarget);
      await postTest({
        action: "update",
        applicationStatus: String(submitted.get("status")),
        memo: String(submitted.get("memo") ?? ""),
        nextActionAt: String(submitted.get("nextActionAt") ?? "") || null,
      });
      setTestSaved(true);
    } catch {
      setTestError(true);
    } finally {
      setTestPending(false);
    }
  }

  async function confirmRestore() {
    if (!restoreId) return;
    if (!testMode) return;
    setTestPending(true);
    try {
      await postTest({ action: "restore", revisionId: restoreId });
      setRestoreId(null);
      setTestSaved(true);
    } catch {
      setTestError(true);
    } finally {
      setTestPending(false);
    }
  }

  async function confirmDelete() {
    if (!testMode) return;
    setTestPending(true);
    try {
      await postTest({ action: "delete" });
      router.push("/jobs");
      router.refresh();
    } catch {
      setTestError(true);
      setTestPending(false);
    }
  }

  const pending = actionPending || testPending;
  const failed = offline || testError || actionState?.ok === false;
  const saved = testSaved || actionState?.ok === true;

  return (
    <div className="stack">
      <section className="card stack">
        <h2>지원 관리</h2>
        <form ref={formRef} action={testMode ? undefined : action} className="stack" onSubmit={onSubmit}>
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="deviceId" value={device} />
          <label>지원 상태
            <select name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>메모<textarea name="memo" value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
          <label>다음 행동<input name="nextActionAt" type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} /></label>
          <div className="row">
            <button className="button" disabled={pending}>{pending ? "저장 중" : "저장"}</button>
            <button className="button secondary" type="button" onClick={() => setDeleteConfirm(true)}>공고 삭제</button>
          </div>
          {failed && <div role="alert" className="error">저장하지 못했습니다. 연결 후 다시 시도해 주세요. <button className="link-button" type="button" onClick={() => formRef.current?.requestSubmit()}>다시 시도</button></div>}
          {saved && <p role="status">저장했습니다.</p>}
        </form>
      </section>

      <section className="card stack" aria-labelledby="revision-heading">
        <h2 id="revision-heading">변경 이력</h2>
        {revisions.length === 0 ? <p className="muted">아직 변경 이력이 없습니다.</p> : (
          <ol className="revision-list">
            {revisions.map((revision) => {
              const revisionStatus = revision.snapshot.applicationStatus ?? revision.snapshot.application_status ?? "unreviewed";
              const revisionMemo = revision.snapshot.memo ?? "";
              const revisionNext = revision.snapshot.nextActionAt ?? revision.snapshot.next_action_at;
              return (
                <li key={revision.id}>
                  <div>
                    <strong>{statuses.find(([value]) => value === revisionStatus)?.[1] ?? revisionStatus}</strong>
                    <p>{revisionMemo || "메모 없음"}</p>
                    <small className="muted">{new Date(revision.changedAt).toLocaleString("ko-KR")} · {revision.deviceId} · {revision.changeKind}</small>
                    {revisionNext && <small className="muted">다음 행동: {new Date(revisionNext).toLocaleString("ko-KR")}</small>}
                  </div>
                  <button className="button secondary" type="button" onClick={() => setRestoreId(revision.id)}>이 값으로 복구</button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {restoreId && (
        <div className="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="restore-title">
          <div className="card stack">
            <h2 id="restore-title">이 값으로 복구할까요?</h2>
            <p>현재 값도 변경 이력에 남아 다시 복구할 수 있습니다.</p>
            <div className="row">
              {testMode ? (
                <button className="button" type="button" onClick={confirmRestore}>복구 확인</button>
              ) : (
                <form action={restoreRevision}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="revisionId" value={restoreId} />
                  <input type="hidden" name="deviceId" value={device} />
                  <button className="button">복구 확인</button>
                </form>
              )}
              <button className="button secondary" type="button" onClick={() => setRestoreId(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="card stack">
            <h2 id="delete-title">공고를 삭제할까요?</h2>
            <p>삭제 전 값은 변경 이력에 보존됩니다.</p>
            <div className="row">
              {testMode ? (
                <button className="button" type="button" onClick={confirmDelete}>삭제 확인</button>
              ) : (
                <form action={deleteJob}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="deviceId" value={device} />
                  <button className="button">삭제 확인</button>
                </form>
              )}
              <button className="button secondary" type="button" onClick={() => setDeleteConfirm(false)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}