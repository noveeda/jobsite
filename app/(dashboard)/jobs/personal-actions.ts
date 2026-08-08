"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { updateE2EPersonalState } from "@/lib/e2e/personal-state";
import { isE2EBypass } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";
import {
  personalJobToggleSchema,
  personalJobTrackingSchema,
} from "@/lib/validation/personal-job-state";

export type PersonalJobActionState =
  | { ok: true; code?: never; message?: never }
  | { ok: false; code: "INVALID_INPUT" | "SAVE_FAILED"; message: string }
  | null;

const invalidInput = (): PersonalJobActionState => ({
  ok: false,
  code: "INVALID_INPUT",
  message: "입력 내용을 확인하고 수정한 뒤 다시 시도해 주세요.",
});

const saveFailed = (): PersonalJobActionState => ({
  ok: false,
  code: "SAVE_FAILED",
  message: "변경 내용을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
});

function refreshPersonalState(canonicalJobId: string) {
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${canonicalJobId}`);
}

async function setPersonalJobToggle(
  field: "saved" | "excluded",
  formData: FormData,
): Promise<PersonalJobActionState> {
  const input = personalJobToggleSchema.safeParse({
    canonicalJobId: formData.get("canonicalJobId"),
    value: formData.get("value"),
  });
  if (!input.success) return invalidInput();

  const user = await requireUser();
  try {
    if (isE2EBypass()) {
      await updateE2EPersonalState(user.id, input.data.canonicalJobId, { [field]: input.data.value });
      refreshPersonalState(input.data.canonicalJobId);
      return { ok: true };
    }
    const supabase = await createClient();
    const toggle = field === "saved"
      ? { saved: input.data.value }
      : { excluded: input.data.value };
    const { error } = await supabase.from("personal_job_states").upsert({
      user_id: user.id,
      canonical_job_id: input.data.canonicalJobId,
      ...toggle,
    }, { onConflict: "user_id,canonical_job_id" });
    if (error) return saveFailed();
    refreshPersonalState(input.data.canonicalJobId);
    return { ok: true };
  } catch {
    return saveFailed();
  }
}

export async function setPersonalJobSaved(
  _previous: PersonalJobActionState,
  formData: FormData,
) {
  return setPersonalJobToggle("saved", formData);
}

export async function setPersonalJobExcluded(
  _previous: PersonalJobActionState,
  formData: FormData,
) {
  return setPersonalJobToggle("excluded", formData);
}

export async function updatePersonalJobTracking(
  _previous: PersonalJobActionState,
  formData: FormData,
): Promise<PersonalJobActionState> {
  const input = personalJobTrackingSchema.safeParse({
    canonicalJobId: formData.get("canonicalJobId"),
    applicationStatus: formData.get("applicationStatus"),
    memo: formData.get("memo") ?? "",
    nextActionAt: formData.get("nextActionAt") ?? "",
  });
  if (!input.success) return invalidInput();

  const user = await requireUser();
  try {
    if (isE2EBypass()) {
      await updateE2EPersonalState(user.id, input.data.canonicalJobId, {
        applicationStatus: input.data.applicationStatus,
        memo: input.data.memo,
        nextActionAt: input.data.nextActionAt,
      });
      refreshPersonalState(input.data.canonicalJobId);
      return { ok: true };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("personal_job_states").upsert({
      user_id: user.id,
      canonical_job_id: input.data.canonicalJobId,
      application_status: input.data.applicationStatus,
      memo: input.data.memo,
      next_action_at: input.data.nextActionAt,
    }, { onConflict: "user_id,canonical_job_id" });
    if (error) return saveFailed();
    refreshPersonalState(input.data.canonicalJobId);
    return { ok: true };
  } catch {
    return saveFailed();
  }
}
