"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, type RateLimitResult } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { applicationStatusSchema } from "@/lib/validation/jobs";

export type TrackingState = { ok: boolean; message?: string } | null;

function mutationLimitMessage(result: Extract<RateLimitResult, { allowed: false }>) {
  return result.unavailable
    ? "현재 변경 요청을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."
    : `변경 요청이 너무 많습니다. ${result.retryAfter}초 후 다시 시도해 주세요.`;
}

export async function updateTracking(_previous: TrackingState, formData: FormData): Promise<TrackingState> {
  await requireUser();
  const id = String(formData.get("jobId"));
  const status = applicationStatusSchema.parse(formData.get("status"));
  const memo = String(formData.get("memo") ?? "");
  const next = String(formData.get("nextActionAt") ?? "") || null;
  const device = String(formData.get("deviceId"));
  try {
    const supabase = await createClient();
    const rateLimit = await consumeRateLimit(supabase, "mutation_write");
    if (!rateLimit.allowed) return { ok: false, message: mutationLimitMessage(rateLimit) };
    const { error } = await supabase.rpc("update_job_tracking", {
      target_job_id: id,
      target_status: status,
      target_memo: memo,
      target_next_action: next as unknown as string,
      target_device: device,
    });
    if (error) throw error;
    revalidatePath(`/jobs/${id}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "저장하지 못했습니다. 연결 후 다시 시도해 주세요." };
  }
}

export async function restoreRevision(formData: FormData) {
  await requireUser();
  const id = String(formData.get("jobId"));
  const supabase = await createClient();
  const rateLimit = await consumeRateLimit(supabase, "mutation_write");
  if (!rateLimit.allowed) throw new Error(mutationLimitMessage(rateLimit));
  const { error } = await supabase.rpc("restore_job_revision", {
    target_job_id: id,
    target_revision_id: String(formData.get("revisionId")),
    target_device: String(formData.get("deviceId")),
  });
  if (error) throw new Error("이력을 복구하지 못했습니다.");
  revalidatePath(`/jobs/${id}`);
}

export async function deleteJob(formData: FormData) {
  await requireUser();
  const supabase = await createClient();
  const rateLimit = await consumeRateLimit(supabase, "mutation_write");
  if (!rateLimit.allowed) throw new Error(mutationLimitMessage(rateLimit));
  const { error } = await supabase.rpc("delete_job", {
    target_job_id: String(formData.get("jobId")),
    target_device: String(formData.get("deviceId")),
  });
  if (error) throw new Error("공고를 삭제하지 못했습니다.");
  revalidatePath("/jobs");
  redirect("/jobs");
}