import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  requireUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  mergeCatalogDuplicate,
  reportCatalogDuplicateIssue,
  separateCatalogDuplicate,
  undoCatalogDuplicate,
} from "@/app/(dashboard)/jobs/catalog-duplicate-actions";

const catalogJobId = "10000000-0000-4000-8000-000000000001";
const candidateId = "20000000-0000-4000-8000-000000000002";
const operationId = "30000000-0000-4000-8000-000000000003";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function decisionForm(overrides: Record<string, string> = {}) {
  return form({
    catalogJobId,
    candidateId,
    operationId,
    expectedRevision: "2",
    userId: "40000000-0000-4000-8000-000000000004",
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "50000000-0000-4000-8000-000000000005" });
  mocks.rpc.mockResolvedValue({ data: { ok: true, status: "merged", revision: 3, candidateId, replayed: false }, error: null });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
});

describe("catalog duplicate Server Actions", () => {
  it.each([
    ["merge", mergeCatalogDuplicate, "merge"],
    ["separate", separateCatalogDuplicate, "separate"],
    ["undo", undoCatalogDuplicate, "undo"],
  ] as const)("submits an authenticated %s without trusting a submitted user", async (_label, action, targetAction) => {
    const result = await action(null, decisionForm());

    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("set_catalog_duplicate_decision", {
      target_candidate_id: candidateId,
      target_action: targetAction,
      target_operation_id: operationId,
      target_expected_revision: 2,
      target_payload: { catalogJobId },
    });
    expect(result).toEqual({ ok: true, status: "merged", revision: 3, replayed: false });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/jobs"], [`/jobs/${catalogJobId}`]]);
  });

  it("keeps a client-generated operation id intact when a failed mutation is retried", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: new Error("database unavailable") })
      .mockResolvedValueOnce({ data: { ok: true, status: "merged", revision: 3, candidateId, replayed: true }, error: null });
    const data = decisionForm();

    const failed = await mergeCatalogDuplicate(null, data);
    const recovered = await mergeCatalogDuplicate(failed, data);

    expect(failed).toMatchObject({ ok: false, code: "SAVE_FAILED" });
    expect(recovered).toMatchObject({ ok: true, replayed: true });
    expect(mocks.rpc.mock.calls.map(([, args]) => args.target_operation_id)).toEqual([operationId, operationId]);
  });

  it("returns typed blocker feedback without falsely reporting success or revalidating", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, code: "INDIRECT_MERGE_CONFLICT", blockingEdges: [candidateId], replayed: false },
      error: null,
    });

    const result = await separateCatalogDuplicate(null, decisionForm());

    expect(result).toMatchObject({ ok: false, code: "INDIRECT_MERGE_CONFLICT", blockingEdges: [candidateId] });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refreshes the latest decision after a stale revision instead of offering a dead retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    const result = await mergeCatalogDuplicate(null, decisionForm());
    expect(result).toMatchObject({ ok: false, code: "STALE_REVISION" });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/jobs"], [`/jobs/${catalogJobId}`]]);
  });

  it("rejects malformed FormData before authentication or mutation", async () => {
    const result = await mergeCatalogDuplicate(null, decisionForm({ candidateId: "not-a-uuid" }));

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("submits bounded reports through the report RPC and refreshes only after confirmation", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, reportId: operationId, replayed: false }, error: null });
    const result = await reportCatalogDuplicateIssue(null, form({
      catalogJobId,
      candidateId,
      operationId,
      category: "broken_link",
      message: "원문 링크가 열리지 않습니다.",
    }));

    expect(mocks.rpc).toHaveBeenCalledWith("submit_catalog_duplicate_issue_report", {
      target_candidate_id: candidateId,
      target_category: "broken_link",
      target_message: "원문 링크가 열리지 않습니다.",
      target_operation_id: operationId,
      target_payload: { catalogJobId },
    });
    expect(result).toEqual({ ok: true, replayed: false });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/jobs"], [`/jobs/${catalogJobId}`]]);
  });

  it("returns typed report validation and RPC errors without a false success", async () => {
    const invalid = await reportCatalogDuplicateIssue(null, form({
      catalogJobId,
      candidateId,
      operationId,
      category: "other",
      message: "",
    }));
    expect(invalid).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("rate limit") });
    const unavailable = await reportCatalogDuplicateIssue(null, form({
      catalogJobId,
      candidateId,
      operationId,
      category: "other",
      message: "확인 부탁드립니다.",
    }));
    expect(unavailable).toMatchObject({ ok: false, code: "SAVE_FAILED" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
