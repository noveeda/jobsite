import type { RateLimitAction, RateLimitResult } from "@/lib/security/rate-limit";

export type E2ERateLimitMode = "denied" | "unavailable";

const globalStore = globalThis as typeof globalThis & {
  __jobHubE2eRateLimits?: Map<RateLimitAction, E2ERateLimitMode>;
};

const decisions = globalStore.__jobHubE2eRateLimits ??= new Map<RateLimitAction, E2ERateLimitMode>();

export function setE2ERateLimit(action: RateLimitAction, mode: E2ERateLimitMode) {
  decisions.set(action, mode);
}

export function resetE2ERateLimits() {
  decisions.clear();
}

export function getE2ERateLimit(action: RateLimitAction): RateLimitResult | null {
  const mode = decisions.get(action);
  if (!mode) return null;
  return mode === "unavailable"
    ? { allowed: false, retryAfter: 60, unavailable: true }
    : { allowed: false, retryAfter: 17, unavailable: false };
}