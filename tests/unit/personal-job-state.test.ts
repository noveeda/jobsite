import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  revalidatePath: vi.fn(),
  requireUser: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  setPersonalJobExcluded,
  setPersonalJobSaved,
  updatePersonalJobTracking,
} from "@/app/(dashboard)/jobs/personal-actions";
import { personalJobStateInputSchema } from "@/lib/validation/personal-job-state";

const canonicalJobId = "11111111-1111-4111-8111-111111111111";
const currentUserId = "22222222-2222-4222-8222-222222222222";
const attackerUserId = "33333333-3333-4333-8333-333333333333";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    canonicalJobId,
    saved: true,
    excluded: false,
    applicationStatus: "planned",
    memo: "지원 서류 점검",
    nextActionAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: currentUserId });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ upsert: mocks.upsert });
  mocks.createClient.mockResolvedValue({ from: mocks.from });
});

describe("personal job state validation", () => {
  it.each(["unreviewed", "planned", "applied", "interviewing", "offered", "rejected", "withdrawn"])(
    "accepts the automatic-catalog application status %s",
    (applicationStatus) => {
      expect(personalJobStateInputSchema.safeParse(baseInput({ applicationStatus })).success).toBe(true);
    },
  );

  it.each(["interested", "accepted", "excluded", "unknown"])(
    "rejects legacy or unsupported application status %s",
    (applicationStatus) => {
      expect(personalJobStateInputSchema.safeParse(baseInput({ applicationStatus })).success).toBe(false);
    },
  );

  it("enforces the backup-v2 10,000 character memo boundary", () => {
    expect(personalJobStateInputSchema.safeParse(baseInput({ memo: "가".repeat(10_000) })).success).toBe(true);
    expect(personalJobStateInputSchema.safeParse(baseInput({ memo: "가".repeat(10_001) })).success).toBe(false);
  });

  it("accepts a UTC next action or null and rejects ambiguous or offset timestamps", () => {
    expect(personalJobStateInputSchema.safeParse(baseInput({ nextActionAt: "2026-08-10T00:00:00.000Z" })).success).toBe(true);
    expect(personalJobStateInputSchema.safeParse(baseInput({ nextActionAt: null })).success).toBe(true);
    expect(personalJobStateInputSchema.safeParse(baseInput({ nextActionAt: "2026-08-10T09:00:00+09:00" })).success).toBe(false);
    expect(personalJobStateInputSchema.safeParse(baseInput({ nextActionAt: "2026-08-10" })).success).toBe(false);
  });

  it("requires a canonical UUID and actual booleans", () => {
    expect(personalJobStateInputSchema.safeParse(baseInput({ canonicalJobId: "not-a-uuid" })).success).toBe(false);
    expect(personalJobStateInputSchema.safeParse(baseInput({ saved: "true" })).success).toBe(false);
    expect(personalJobStateInputSchema.safeParse(baseInput({ excluded: "false" })).success).toBe(false);
  });
});

describe("personal job state Server Actions", () => {
  it.each([
    ["save", setPersonalJobSaved, "true", { saved: true }],
    ["unsave", setPersonalJobSaved, "false", { saved: false }],
    ["exclude", setPersonalJobExcluded, "true", { excluded: true }],
    ["restore", setPersonalJobExcluded, "false", { excluded: false }],
  ] as const)("can %s without trusting a submitted user id", async (_label, action, value, state) => {
    const result = await action(null, form({ canonicalJobId, value, userId: attackerUserId }));

    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith("personal_job_states");
    expect(mocks.upsert).toHaveBeenCalledWith({
      user_id: currentUserId,
      canonical_job_id: canonicalJobId,
      ...state,
    }, { onConflict: "user_id,canonical_job_id" });
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/jobs"], [`/jobs/${canonicalJobId}`]]);
  });

  it("updates status, memo, and a UTC next action for the current user", async () => {
    const result = await updatePersonalJobTracking(null, form({
      canonicalJobId,
      applicationStatus: "interviewing",
      memo: "2차 면접 준비",
      nextActionAt: "2026-08-12T03:00:00.000Z",
      userId: attackerUserId,
    }));

    expect(mocks.upsert).toHaveBeenCalledWith({
      user_id: currentUserId,
      canonical_job_id: canonicalJobId,
      application_status: "interviewing",
      memo: "2차 면접 준비",
      next_action_at: "2026-08-12T03:00:00.000Z",
    }, { onConflict: "user_id,canonical_job_id" });
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/jobs"], [`/jobs/${canonicalJobId}`]]);
  });

  it("maps an empty next action to null", async () => {
    await updatePersonalJobTracking(null, form({
      canonicalJobId,
      applicationStatus: "unreviewed",
      memo: "",
      nextActionAt: "",
    }));

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ next_action_at: null }), {
      onConflict: "user_id,canonical_job_id",
    });
  });

  it("returns actionable validation feedback without writing or reporting success", async () => {
    const result = await updatePersonalJobTracking(null, form({
      canonicalJobId,
      applicationStatus: "interviewing",
      memo: "가".repeat(10_001),
      nextActionAt: "2026-08-12",
    }));

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(result).not.toEqual({ ok: true });
    expect(result?.message).toMatch(/확인|수정|다시/);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps failed writes recoverable and revalidates only after a successful retry", async () => {
    mocks.upsert
      .mockResolvedValueOnce({ error: new Error("database unavailable") })
      .mockResolvedValueOnce({ error: null });
    const data = form({ canonicalJobId, value: "true" });

    const failed = await setPersonalJobSaved(null, data);
    expect(failed).toMatchObject({ ok: false, code: "SAVE_FAILED" });
    expect(failed).not.toEqual({ ok: true });
    expect(failed?.message).toMatch(/다시 시도|저장하지 못/);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    const recovered = await setPersonalJobSaved(failed, data);
    expect(recovered).toEqual({ ok: true });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/jobs"], [`/jobs/${canonicalJobId}`]]);
  });

  it("does not revalidate or claim success when the database client throws", async () => {
    mocks.upsert.mockRejectedValueOnce(new Error("network secret must not escape"));

    const result = await setPersonalJobExcluded(null, form({ canonicalJobId, value: "true" }));

    expect(result).toMatchObject({ ok: false, code: "SAVE_FAILED" });
    expect(result).not.toEqual({ ok: true });
    expect(result?.message).not.toContain("network secret");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
