import { isE2EBypass } from "@/lib/environment";
import { redirect } from "next/navigation";
import { createClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export async function requireUser() {
  if (isE2EBypass()) {
    return { id: "00000000-0000-4000-8000-000000000001", email: "e2e@example.com" };
  }
  if (!hasSupabaseEnvironment()) redirect("/login?error=config");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}
