"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { setE2ECatalogDuplicateDecision, submitE2ECatalogDuplicateIssueReport } from "@/lib/e2e/catalog-duplicate-store";
import { isE2EBypass } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

const decisionInputSchema = z.object({
  catalogJobId: uuid,
  candidateId: uuid,
  operationId: uuid,
  expectedRevision: z.coerce.number().int().min(0),
}).strict();

const reportInputSchema = z.object({
  catalogJobId: uuid,
  candidateId: uuid,
  operationId: uuid,
  category: z.enum(["incorrect_value", "duplicate", "broken_link", "attribution", "other"]),
  message: z.string().trim().min(1).max(2_000),
}).strict();

const successResultSchema = z.object({
  ok: z.literal(true),
  status: z.enum(["merged", "separate", "undone"]).optional(),
  revision: z.number().int().min(0).optional(),
  replayed: z.boolean(),
});

const blockedResultSchema = z.object({
  ok: z.literal(false),
  code: z.enum(["SEPARATE_CONFLICT", "INDIRECT_MERGE_CONFLICT", "COMPONENT_LIMIT"]),
  blockingEdges: z.array(uuid).max(25),
});

export type CatalogDuplicateActionState =
  | { ok: true; status?: "merged" | "separate" | "undone"; revision?: number; replayed: boolean }
  | {
    ok: false;
    code: "SEPARATE_CONFLICT" | "INDIRECT_MERGE_CONFLICT" | "COMPONENT_LIMIT";
    message: string;
    blockingEdges: string[];
  }
  | {
    ok: false;
    code: "INVALID_INPUT" | "AUTH_REQUIRED" | "SAVE_FAILED";
    message: string;
  }
  | null;

const invalidInput = (): CatalogDuplicateActionState => ({
  ok: false,
  code: "INVALID_INPUT",
  message: "입력 내용을 확인한 뒤 다시 시도해 주세요.",
});

const authRequired = (): Exclude<CatalogDuplicateActionState, null> => ({
  ok: false,
  code: "AUTH_REQUIRED",
  message: "로그인 상태를 확인한 뒤 다시 시도해 주세요.",
});

const saveFailed = (): CatalogDuplicateActionState => ({
  ok: false,
  code: "SAVE_FAILED",
  message: "변경 내용을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
});

function blocked(code: "SEPARATE_CONFLICT" | "INDIRECT_MERGE_CONFLICT" | "COMPONENT_LIMIT", blockingEdges: string[]): CatalogDuplicateActionState {
  const messages = {
    SEPARATE_CONFLICT: "별개로 유지한 공고와 다시 연결할 수 없습니다. 먼저 차단된 결정을 되돌린 뒤 직접 다시 시도해 주세요.",
    INDIRECT_MERGE_CONFLICT: "이미 연결된 공고는 바로 별개로 유지할 수 없습니다. 아래 연결 결정을 먼저 되돌린 뒤 직접 다시 시도해 주세요.",
    COMPONENT_LIMIT: "연결된 공고 수가 안전 한도에 도달했습니다. 현재 판단은 적용되지 않았습니다.",
  } as const;
  return { ok: false, code, message: messages[code], blockingEdges };
}

function refreshCatalogDuplicate(catalogJobId: string) {
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${catalogJobId}`);
}

function isRedirect(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error
    && typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT");
}

type AuthenticatedAction = { user: { id: string } } | { error: Exclude<CatalogDuplicateActionState, null> };

async function authenticateAction(): Promise<AuthenticatedAction> {
  try {
    return { user: { id: (await requireUser()).id } };
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: authRequired() };
  }
}

async function submitDecision(
  action: "merge" | "separate" | "undo",
  formData: FormData,
): Promise<CatalogDuplicateActionState> {
  const input = decisionInputSchema.safeParse({
    catalogJobId: formData.get("catalogJobId"),
    candidateId: formData.get("candidateId"),
    operationId: formData.get("operationId"),
    expectedRevision: formData.get("expectedRevision"),
  });
  if (!input.success) return invalidInput();

  const authentication = await authenticateAction();
  if ("error" in authentication) return authentication.error;

  try {
    if (isE2EBypass()) {
      const result = await setE2ECatalogDuplicateDecision({
        userId: authentication.user.id,
        candidateId: input.data.candidateId,
        action,
        operationId: input.data.operationId,
        expectedRevision: input.data.expectedRevision,
      });
      if (!result.ok) return blocked(result.code, result.blockingEdges);
      refreshCatalogDuplicate(input.data.catalogJobId);
      return result;
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_catalog_duplicate_decision", {
      target_candidate_id: input.data.candidateId,
      target_action: action,
      target_operation_id: input.data.operationId,
      target_expected_revision: input.data.expectedRevision,
      target_payload: { catalogJobId: input.data.catalogJobId },
    });
    if (error) return saveFailed();

    const result = successResultSchema.safeParse(data);
    if (result.success) {
      refreshCatalogDuplicate(input.data.catalogJobId);
      return {
        ok: true,
        status: result.data.status,
        revision: result.data.revision,
        replayed: result.data.replayed,
      };
    }
    const conflict = blockedResultSchema.safeParse(data);
    if (conflict.success) return blocked(conflict.data.code, conflict.data.blockingEdges);
    return saveFailed();
  } catch {
    return saveFailed();
  }
}

export async function mergeCatalogDuplicate(
  _previous: CatalogDuplicateActionState,
  formData: FormData,
) {
  return submitDecision("merge", formData);
}

export async function separateCatalogDuplicate(
  _previous: CatalogDuplicateActionState,
  formData: FormData,
) {
  return submitDecision("separate", formData);
}

export async function undoCatalogDuplicate(
  _previous: CatalogDuplicateActionState,
  formData: FormData,
) {
  return submitDecision("undo", formData);
}

export async function reportCatalogDuplicateIssue(
  _previous: CatalogDuplicateActionState,
  formData: FormData,
): Promise<CatalogDuplicateActionState> {
  const input = reportInputSchema.safeParse({
    catalogJobId: formData.get("catalogJobId"),
    candidateId: formData.get("candidateId"),
    operationId: formData.get("operationId"),
    category: formData.get("category"),
    message: formData.get("message"),
  });
  if (!input.success) return invalidInput();

  const authentication = await authenticateAction();
  if ("error" in authentication) return authentication.error;

  try {
    if (isE2EBypass()) {
      const result = await submitE2ECatalogDuplicateIssueReport({
        userId: authentication.user.id,
        candidateId: input.data.candidateId,
        operationId: input.data.operationId,
      });
      if (!result.ok) return saveFailed();
      return result;
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("submit_catalog_duplicate_issue_report", {
      target_candidate_id: input.data.candidateId,
      target_category: input.data.category,
      target_message: input.data.message,
      target_operation_id: input.data.operationId,
      target_payload: { catalogJobId: input.data.catalogJobId },
    });
    if (error) return saveFailed();
    const result = successResultSchema.safeParse(data);
    if (!result.success) return saveFailed();
    refreshCatalogDuplicate(input.data.catalogJobId);
    return { ok: true, replayed: result.data.replayed };
  } catch {
    return saveFailed();
  }
}
