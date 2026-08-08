import { isE2EBypass, validateServerEnvironment } from "@/lib/environment";
import { getDiscoveryScenario } from "@/lib/e2e/automatic-discovery";
import { getE2EUserId } from "@/lib/e2e/personal-state";
import { redirect } from "next/navigation";
import { createClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireOperator(
  userId: string | null | undefined,
  operatorIds: readonly string[],
) {
  if (!userId || !uuidPattern.test(userId) || !operatorIds.includes(userId)) {
    throw new Error("OPERATOR_ACCESS_DENIED");
  }
  return userId;
}

export async function requireUser() {
  if (isE2EBypass()) {
    if (await getDiscoveryScenario() === "anonymous") redirect("/login");
    return { id: await getE2EUserId() ?? "00000000-0000-4000-8000-000000000001", email: "e2e@example.com" };
  }
  if (!hasSupabaseEnvironment()) redirect("/login?error=config");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireCurrentOperator() {
  const user = await requireUser();
  return requireOperator(user.id, validateServerEnvironment().operatorUserIds);
}
