import { cookies } from "next/headers";

import { isE2EBypass } from "@/lib/environment";
import type { PersonalApplicationStatus } from "@/lib/validation/personal-job-state";

export const e2eUserCookie = "jobhub-e2e-user-id";
const e2ePersonalStateCookie = "jobhub-e2e-personal-states";

export type E2EPersonalState = {
  saved: boolean;
  excluded: boolean;
  applicationStatus: PersonalApplicationStatus;
  memo: string;
  nextActionAt: string | null;
};

const emptyState = (): E2EPersonalState => ({
  saved: false,
  excluded: false,
  applicationStatus: "unreviewed",
  memo: "",
  nextActionAt: null,
});

function key(userId: string, canonicalJobId: string) {
  return `${userId}:${canonicalJobId}`;
}

async function readStates() {
  try {
    const raw = (await cookies()).get(e2ePersonalStateCookie)?.value;
    if (!raw) return {} as Record<string, E2EPersonalState>;
    const parsed = JSON.parse(raw) as Record<string, E2EPersonalState>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {} as Record<string, E2EPersonalState>;
  }
}

export async function getE2EUserId() {
  if (!isE2EBypass()) return null;
  try {
    return (await cookies()).get(e2eUserCookie)?.value
      ?? "00000000-0000-4000-8000-000000000001";
  } catch {
    return "00000000-0000-4000-8000-000000000001";
  }
}

export async function getE2EPersonalState(userId: string, canonicalJobId: string) {
  const states = await readStates();
  return structuredClone(states[key(userId, canonicalJobId)] ?? emptyState());
}

export async function updateE2EPersonalState(
  userId: string,
  canonicalJobId: string,
  change: Partial<E2EPersonalState>,
) {
  const store = await readStates();
  const stateKey = key(userId, canonicalJobId);
  const next = { ...(store[stateKey] ?? emptyState()), ...change };
  store[stateKey] = next;
  (await cookies()).set(e2ePersonalStateCookie, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return structuredClone(next);
}
