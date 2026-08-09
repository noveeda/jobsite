"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const messages: Record<string, string> = {
  oauth_callback: "Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  config: "서비스 로그인이 아직 준비되지 않았습니다.",
};

function LoginQueryError() {
  const code = useSearchParams().get("error");
  if (!code) return null;
  return <p role="alert" className="error">{messages[code] ?? "로그인을 완료하지 못했습니다."}</p>;
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const localPasswordLoginEnabled =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1");

  async function signIn() {
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setError("Google 로그인을 시작하지 못했습니다.");
    } catch {
      setError("로그인 환경이 아직 준비되지 않았습니다.");
    }
  }

  async function signInWithPassword() {
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError("이메일 또는 비밀번호를 확인해 주세요.");
        return;
      }
      // The server must receive the newly written Supabase session cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/jobs");
    } catch {
      setError("로컬 로그인 환경을 시작하지 못했습니다.");
    }
  }

  return (
    <main className="login-shell">
      <section className="card login-card">
        <p className="eyebrow">JOB POSTING HUB</p>
        <h1>흩어진 채용공고를<br />한곳에서 관리하세요.</h1>
        <p className="muted">원문 링크, 지원 상태와 메모를 Google 계정별 공간에 모읍니다.</p>
        <button className="button" type="button" onClick={signIn}>Google로 계속하기</button>
        {localPasswordLoginEnabled ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void signInWithPassword();
            }}
          >
            <p className="muted">로컬 개발 전용 로그인</p>
            <label>
              이메일
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              비밀번호
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button className="button" type="submit">로컬 계정으로 로그인</button>
          </form>
        ) : null}
        <p className="policy-links">
          계속하면 <Link href="/terms">이용약관</Link>과 <Link href="/privacy">개인정보 처리방침</Link>을 확인할 수 있으며,
          로그인 후 필수 동의를 요청합니다.
        </p>
        {error ? <p role="alert" className="error">{error}</p> : <Suspense fallback={null}><LoginQueryError /></Suspense>}
      </section>
    </main>
  );
}
