import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isE2EBypass } from "@/lib/environment";

export type RateLimitAction = Database["public"]["Enums"]["rate_limit_action"];
export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: string }
  | { allowed: false; retryAfter: number; unavailable: boolean };

export async function consumeRateLimit(
  client: SupabaseClient<Database>,
  action: RateLimitAction,
): Promise<RateLimitResult> {
  if (isE2EBypass()) return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, resetAt: new Date(0).toISOString() };
  const { data, error } = await client.rpc("consume_rate_limit", { target_action: action });
  const decision = data?.[0];
  if (error || !decision) return { allowed: false, retryAfter: 60, unavailable: true };
  return decision.allowed
    ? { allowed: true, remaining: decision.remaining, resetAt: decision.reset_at }
    : { allowed: false, retryAfter: Math.max(1, decision.retry_after_seconds), unavailable: false };
}
