"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/legal/policy";

export function AccountDeletion() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [exportAcknowledged, setExportAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const enabled = confirmation === ACCOUNT_DELETION_CONFIRMATION && exportAcknowledged && !pending;

  async function removeAccount() {
    if (!enabled) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation, exportAcknowledged }),
      });
      if (response.status === 204) {
        router.push("/login?deleted=1");
        return;
      }
      const result = await response.json();
      if (result.code === "REAUTH_REQUIRED" && result.details?.reauthenticateAt) {
        router.push(result.details.reauthenticateAt);
        return;
      }
      throw new Error(result.message ?? "계정을 삭제하지 못했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "계정을 삭제하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <section className="card stack danger-zone" aria-labelledby="account-delete-heading">
      <h2 id="account-delete-heading">회원 탈퇴</h2>
      <p>인증 계정과 저장한 공고, 출처, 메모, 일정, 변경 이력 및 동의 기록이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
      <p><a href="/api/export" download>탈퇴 전에 JSON 백업 내려받기</a></p>
      <label className="checkbox-label">
        <input type="checkbox" checked={exportAcknowledged} onChange={(event) => setExportAcknowledged(event.target.checked)} />
        백업 경로와 영구 삭제 범위를 확인했습니다.
      </label>
      <label>확인을 위해 <strong>{ACCOUNT_DELETION_CONFIRMATION}</strong> 입력
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
      </label>
      <button className="button danger" type="button" disabled={!enabled} onClick={removeAccount}>
        {pending ? "삭제 중…" : "계정과 데이터 영구 삭제"}
      </button>
      {error && <p role="alert" className="error">{error} 다시 시도해 주세요.</p>}
    </section>
  );
}
