"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  async function signIn() {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setError("Google 로그인을 시작하지 못했습니다.");
    } catch {
      setError("Supabase 환경 변수를 먼저 설정해 주세요.");
    }
  }
  return (
    <main className="login-shell">
      <section className="card login-card">
        <p className="eyebrow">PERSONAL JOB HUB</p>
        <h1>흩어진 채용공고를<br />한곳에서 관리하세요.</h1>
        <p className="muted">원문 링크, 지원 상태, 메모를 내 계정에 안전하게 모읍니다.</p>
        <button className="button" type="button" onClick={signIn}>Google로 계속하기</button>
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </main>
  );
}
