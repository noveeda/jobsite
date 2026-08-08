import Link from "next/link";
import { redirect } from "next/navigation";
import { isE2EBypass } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";

async function logout() {
  "use server";
  if (isE2EBypass()) redirect("/login");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export function AppShell({ children, email }: { children: React.ReactNode; email?: string }) {
  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link href="/jobs" className="brand">채용공고 허브</Link>
          <nav className="row" aria-label="주요 메뉴">
            <Link href="/jobs">공고</Link>
            <Link href="/jobs/new">직접 공고 등록</Link>
            <Link href="/settings/data">설정</Link>
            <span className="muted">{email}</span>
            <form action={logout}><button className="link-button">로그아웃</button></form>
          </nav>
        </div>
      </header>
      <main id="main-content" className="container page-shell">{children}</main>
      <footer className="legal-footer">
        <nav className="container row" aria-label="서비스 정책">
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보 처리방침</Link>
          <Link href="/sources">외부 출처 안내</Link>
        </nav>
      </footer>
    </>
  );
}
