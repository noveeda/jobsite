import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { hasLatestConsent } from "@/lib/consent";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  if (!await hasLatestConsent(user.id)) redirect("/consent");
  return <AppShell email={user.email}>{children}</AppShell>;
}
