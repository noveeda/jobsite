import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function logout() {
  "use server";
  if (process.env.E2E_BYPASS_AUTH === "true") redirect("/login");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export function AppShell({ children, email }: { children: React.ReactNode; email?: string }) {
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link href="/jobs" className="brand">채용공고 허브</Link>
          <nav className="row" aria-label="주요 메뉴">
            <Link href="/jobs">공고</Link>
            <Link href="/settings/data">데이터</Link>
            <span className="muted">{email}</span>
            <form action={logout}><button className="link-button">로그아웃</button></form>
          </nav>
        </div>
      </header>
      <main className="container page-shell">{children}</main>
    </>
  );
}