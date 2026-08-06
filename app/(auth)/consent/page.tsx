"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acceptCurrentPolicies } from "./actions";

export default function ConsentPage() {
  const [state, formAction, pending] = useActionState(acceptCurrentPolicies, null);
  const retrying = state?.code === "RATE_LIMITED"
    || state?.code === "SERVICE_UNAVAILABLE"
    || state?.code === "SAVE_FAILED";

  return (
    <main className="login-shell">
      <section className="card login-card stack" aria-labelledby="consent-title">
        <header>
          <p className="eyebrow">PUBLIC BETA CONSENT</p>
          <h1 id="consent-title">시작하기 전에<br />필수 고지를 확인해 주세요.</h1>
          <p className="muted">
            계정별 채용공고 공간을 제공하려면 이용 조건과 개인정보 처리 내용을 확인하고 각각 동의해야 합니다.
          </p>
        </header>

        <form action={formAction} className="stack">
          <div className="stack">
            <div className="stack">
              <label className="checkbox-label" htmlFor="termsAccepted">
                <input
                  id="termsAccepted"
                  name="termsAccepted"
                  type="checkbox"
                  required
                  aria-invalid={Boolean(state?.fieldErrors?.termsAccepted)}
                  aria-describedby={state?.fieldErrors?.termsAccepted ? "terms-error" : undefined}
                />
                이용약관에 동의합니다. (필수)
              </label>
              <Link href="/terms">이용약관 전문 보기</Link>
              {state?.fieldErrors?.termsAccepted && (
                <p id="terms-error" className="error">{state.fieldErrors.termsAccepted}</p>
              )}
            </div>

            <div className="stack">
              <label className="checkbox-label" htmlFor="privacyAccepted">
                <input
                  id="privacyAccepted"
                  name="privacyAccepted"
                  type="checkbox"
                  required
                  aria-invalid={Boolean(state?.fieldErrors?.privacyAccepted)}
                  aria-describedby={state?.fieldErrors?.privacyAccepted ? "privacy-error" : undefined}
                />
                개인정보 처리방침에 동의합니다. (필수)
              </label>
              <Link href="/privacy">개인정보 처리방침 전문 보기</Link>
              {state?.fieldErrors?.privacyAccepted && (
                <p id="privacy-error" className="error">{state.fieldErrors.privacyAccepted}</p>
              )}
            </div>
          </div>

          <p className="muted">
            동의하지 않으면 개인 공고 공간에 들어갈 수 없습니다. 고지 문서는 로그인하지 않아도 언제든지 볼 수 있습니다.
          </p>

          {state && (
            <div role="alert" className="error">
              <p>{state.message}</p>
              {state.retryAfter && <p>{state.retryAfter}초 뒤 다시 시도할 수 있습니다.</p>}
            </div>
          )}

          <button className="button" type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "동의 저장 중…" : retrying ? "다시 시도" : "동의하고 시작하기"}
          </button>
        </form>

        <nav className="row" aria-label="추가 안내">
          <Link href="/sources">외부 출처 안내</Link>
          <Link href="/login">다른 계정으로 로그인</Link>
        </nav>
      </section>
    </main>
  );
}
