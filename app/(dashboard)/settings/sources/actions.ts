"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentOperator } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const providerCodeSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/);

export async function disableSourceProvider(formData: FormData) {
  await requireCurrentOperator();
  const providerCode = providerCodeSchema.parse(formData.get("providerCode"));
  const { data, error } = await createAdminClient().rpc("disable_source_provider", {
    target_provider_code: providerCode,
    target_reason: "OPERATOR_DISABLED",
  });
  if (error || !data) throw new Error("SOURCE_PROVIDER_DISABLE_FAILED");
  revalidatePath("/settings/sources");
}
