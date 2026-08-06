"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function decideDuplicate(formData: FormData) {
  await requireUser();
  const pairId = String(formData.get("pairId"));
  const decision = String(formData.get("decision")) as "confirmed" | "rejected";
  const supabase = await createClient();
  const rateLimit = await consumeRateLimit(supabase, "mutation_write");
  if (!rateLimit.allowed) {
    throw new Error(rateLimit.unavailable
      ? "현재 중복 판단 요청을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."
      : `중복 판단 요청이 너무 많습니다. ${rateLimit.retryAfter}초 후 다시 시도해 주세요.`);
  }
  const { error } = await supabase.rpc("decide_duplicate", {
    target_pair_id: pairId,
    target_decision: decision,
  });
  if (error) throw new Error("중복 판단을 저장하지 못했습니다.");
  revalidatePath("/jobs");
}