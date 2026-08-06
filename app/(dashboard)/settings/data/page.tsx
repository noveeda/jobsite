"use client";

import { useState } from "react";
import { AccountDeletion } from "@/components/account-deletion";

type Preview = {
  counts: { jobs: number; sources: number; duplicatePairs: number; revisions: number };
  conflicts: number;
};

export default function DataSettingsPage() {
  const [backupText, setBackupText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setConfirmed(false);
    setError("");
    setSuccess("");
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("유효하지 않은 백업입니다. 파일은 10 MiB 이하여야 합니다.");
      return;
    }
    setBusy(true);
    const text = await file.text();
    setBackupText(text);
    try {
      const response = await fetch("/api/import/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: text,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.errors?.[0] ?? result.message);
      setPreview(result);
    } catch (reason) {
      setError(`유효하지 않은 백업입니다. ${reason instanceof Error ? reason.message : ""}`);
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!preview || !confirmed || !backupText) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: backupText,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setSuccess("복원이 완료되었습니다. 공고, 출처, 중복 판단, 이력, 메모와 일정이 반영되었습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "복원에 실패해 모든 변경을 되돌렸습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">DATA PORTABILITY</p>
          <h1>데이터 내보내기와 복원</h1>
          <p className="muted">계정 식별자와 인증 정보 없이 구조화된 JSON으로 보관합니다.</p>
        </div>
        <a className="button" href="/api/export" download>JSON 내보내기</a>
      </header>

      <section className="card stack" aria-labelledby="restore-heading">
        <h2 id="restore-heading">백업 복원</h2>
        <p className="muted">검증 단계에서는 아무 데이터도 변경하지 않습니다. 최대 파일 크기는 10 MiB입니다.</p>
        <label>백업 JSON 파일
          <input type="file" accept="application/json,.json" onChange={selectFile} />
        </label>
        {busy && <p role="status">처리 중입니다…</p>}
        {preview && (
          <div className="stack">
            <p>
              공고 {preview.counts.jobs}개 · 출처 {preview.counts.sources}개 ·
              중복 판단 {preview.counts.duplicatePairs}개 · 이력 {preview.counts.revisions}개 ·
              충돌 {preview.conflicts}건
            </p>
            <label className="checkbox-label">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              기존 데이터 덮어쓰기에 동의
            </label>
          </div>
        )}
        <button className="button" type="button" disabled={!preview || !confirmed || busy} onClick={restore}>복원 실행</button>
        {error && <p role="alert" className="error">{error}</p>}
        {success && <p role="status">{success}</p>}
      </section>
      <AccountDeletion />
    </div>
  );
}