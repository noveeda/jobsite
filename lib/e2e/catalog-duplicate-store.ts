import { cookies } from "next/headers";

import { getDiscoveryScenario } from "@/lib/e2e/automatic-discovery";
import { isE2EBypass } from "@/lib/environment";
import type { CatalogDuplicateDetail } from "@/lib/validation/feed";

export const e2eDuplicateJobIds = {
  a: "10000000-0000-4000-8000-000000000101",
  b: "10000000-0000-4000-8000-000000000102",
  c: "10000000-0000-4000-8000-000000000103",
} as const;

const duplicateStateCookie = "jobhub-e2e-catalog-duplicates";
const candidates = [
  { id: "20000000-0000-4000-8000-000000000101", left: e2eDuplicateJobIds.a, right: e2eDuplicateJobIds.b },
  { id: "20000000-0000-4000-8000-000000000102", left: e2eDuplicateJobIds.b, right: e2eDuplicateJobIds.c },
  { id: "20000000-0000-4000-8000-000000000103", left: e2eDuplicateJobIds.a, right: e2eDuplicateJobIds.c },
] as const;

type Decision = "merged" | "separate" | null;
type DecisionRecord = { decision: Decision; revision: number; history: { action: "merge" | "separate" | "undo"; createdAt: string }[] };
type Result = { ok: true; status?: "merged" | "separate" | "undone"; revision?: number; replayed: boolean }
  | { ok: false; code: "SEPARATE_CONFLICT" | "INDIRECT_MERGE_CONFLICT" | "COMPONENT_LIMIT"; blockingEdges: string[]; message: string };
type State = { decisions: Record<string, DecisionRecord>; reports: Record<string, true>; operations: Record<string, Result> };

const emptyState = (): State => ({ decisions: {}, reports: {}, operations: {} });
const decisionKey = (userId: string, candidateId: string) => `${userId}:${candidateId}`;
const operationKey = (userId: string, operationId: string) => `${userId}:${operationId}`;
const defaultDecision = (): DecisionRecord => ({ decision: null, revision: 0, history: [] });

export function isE2EDuplicateScenario(scenario: Awaited<ReturnType<typeof getDiscoveryScenario>>) {
  return scenario === "duplicates" || scenario === "duplicates-report-failure";
}

async function readState() {
  try {
    const raw = (await cookies()).get(duplicateStateCookie)?.value;
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as State;
    return parsed && typeof parsed === "object" ? parsed : emptyState();
  } catch {
    return emptyState();
  }
}

async function saveState(state: State) {
  (await cookies()).set(duplicateStateCookie, JSON.stringify(state), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
}

function findCandidate(candidateId: string) {
  return candidates.find((candidate) => candidate.id === candidateId) ?? null;
}

function connected(state: State, userId: string, start: string, end: string, excludedCandidateId?: string) {
  const visited = new Set([start]);
  const pending = [start];
  while (pending.length) {
    const current = pending.shift()!;
    for (const candidate of candidates) {
      if (candidate.id === excludedCandidateId || state.decisions[decisionKey(userId, candidate.id)]?.decision !== "merged") continue;
      const next = candidate.left === current ? candidate.right : candidate.right === current ? candidate.left : null;
      if (!next || visited.has(next)) continue;
      if (next === end) return true;
      visited.add(next);
      pending.push(next);
    }
  }
  return false;
}

function members(state: State, userId: string, start: string) {
  const memberIds = [start];
  for (const candidate of candidates) {
    if (connected(state, userId, start, candidate.left) && !memberIds.includes(candidate.left)) memberIds.push(candidate.left);
    if (connected(state, userId, start, candidate.right) && !memberIds.includes(candidate.right)) memberIds.push(candidate.right);
  }
  return memberIds.sort();
}

function conflict(code: Extract<Result, { ok: false }>['code'], blockingEdges: string[]): Result {
  const message = code === "SEPARATE_CONFLICT"
    ? "별개로 유지한 공고와 다시 연결할 수 없습니다."
    : "이미 다른 경로로 연결된 공고는 바로 별개로 유지할 수 없습니다.";
  return { ok: false, code, blockingEdges, message };
}

export async function getE2ECatalogDuplicateDetail(userId: string, subjectId: string): Promise<CatalogDuplicateDetail> {
  const state = await readState();
  return {
    candidates: candidates.filter((candidate) => candidate.left === subjectId || candidate.right === subjectId).map((candidate) => {
      const record = state.decisions[decisionKey(userId, candidate.id)] ?? defaultDecision();
      const counterpartId = candidate.left === subjectId ? candidate.right : candidate.left;
      return {
        id: candidate.id,
        counterpartId,
        score: 0.9,
        reasons: ["company_match", "title_similarity", "cross_provider"],
        evidenceRevision: 1,
        active: true,
        sources: [
          { provider: "fixture-page", providerName: "Fixture Page", originalUrl: "https://fixture-page.example.invalid/jobs/duplicate-a", observedAt: "2026-08-09T01:00:00.000Z" },
          { provider: "fixture-token", providerName: "Fixture Token", originalUrl: "https://fixture-token.example.invalid/jobs/duplicate-b", observedAt: "2026-08-09T02:00:00.000Z" },
        ],
        conflicts: [
          { field: "deadlineAt" as const, values: [
            { provider: "fixture-page", observedAt: "2026-08-09T01:00:00.000Z", value: "2026-08-20T15:00:00.000Z" },
            { provider: "fixture-token", observedAt: "2026-08-09T02:00:00.000Z", value: "2026-08-21T15:00:00.000Z" },
          ] },
          { field: "locations" as const, values: [
            { provider: "fixture-page", observedAt: "2026-08-09T01:00:00.000Z", value: "서울" },
            { provider: "fixture-token", observedAt: "2026-08-09T02:00:00.000Z", value: "경기" },
          ] },
        ],
        currentUser: record,
        group: { representativeId: members(state, userId, subjectId)[0], memberIds: members(state, userId, subjectId) },
      };
    }),
  };
}

export async function setE2ECatalogDuplicateDecision(input: {
  userId: string;
  candidateId: string;
  action: "merge" | "separate" | "undo";
  operationId: string;
  expectedRevision: number;
}): Promise<Result> {
  if (!isE2EBypass()) return conflict("COMPONENT_LIMIT", []);
  const candidate = findCandidate(input.candidateId);
  if (!candidate) return conflict("COMPONENT_LIMIT", []);
  const state = await readState();
  const operation = operationKey(input.userId, input.operationId);
  const replay = state.operations[operation];
  if (replay) return replay.ok ? { ...replay, replayed: true } : replay;
  const key = decisionKey(input.userId, candidate.id);
  const current = state.decisions[key] ?? defaultDecision();
  if (current.revision !== input.expectedRevision) return conflict("COMPONENT_LIMIT", []);

  if (input.action === "separate" && connected(state, input.userId, candidate.left, candidate.right, candidate.id)) {
    const result = conflict("INDIRECT_MERGE_CONFLICT", [candidate.id]);
    state.operations[operation] = result;
    await saveState(state);
    return result;
  }
  if (input.action === "merge") {
    const separatelyHeld = candidates.find((other) => state.decisions[decisionKey(input.userId, other.id)]?.decision === "separate"
      && connected(state, input.userId, other.left, other.right));
    if (separatelyHeld) {
      const result = conflict("SEPARATE_CONFLICT", [separatelyHeld.id]);
      state.operations[operation] = result;
      await saveState(state);
      return result;
    }
  }

  const decision = input.action === "undo" ? null : input.action === "merge" ? "merged" : "separate";
  const status: "merged" | "separate" | "undone" = input.action === "undo"
    ? "undone"
    : input.action === "merge"
      ? "merged"
      : "separate";
  const next = { decision, revision: current.revision + 1, history: [...current.history, { action: input.action, createdAt: "2026-08-09T03:00:00.000Z" }] } as DecisionRecord;
  state.decisions[key] = next;
  const result: Result = { ok: true, status, revision: next.revision, replayed: false };
  state.operations[operation] = result;
  await saveState(state);
  return result;
}

export async function submitE2ECatalogDuplicateIssueReport(input: { userId: string; candidateId: string; operationId: string }) {
  if (!isE2EBypass() || !findCandidate(input.candidateId)) return { ok: false as const };
  if (await getDiscoveryScenario() === "duplicates-report-failure") return { ok: false as const };
  const state = await readState();
  const operation = operationKey(input.userId, input.operationId);
  if (state.reports[operation]) return { ok: true as const, replayed: true };
  state.reports[operation] = true;
  await saveState(state);
  return { ok: true as const, replayed: false };
}
