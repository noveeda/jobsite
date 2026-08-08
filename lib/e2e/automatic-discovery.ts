import { cookies } from "next/headers";
import { z } from "zod";

import { isE2EBypass } from "@/lib/environment";

export const discoveryScenarioCookie = "jobhub-discovery-scenario";

export const discoveryScenarioSchema = z.enum([
  "anonymous",
  "preparing",
  "ready-empty",
  "healthy",
  "performance-1000",
  "partial",
  "failed-cached",
  "failed-empty",
  "degraded",
  "closed-saved",
  "withdrawn-saved",
  "exception",
]);

export type DiscoveryScenario = z.infer<typeof discoveryScenarioSchema>;

export async function getDiscoveryScenario(): Promise<DiscoveryScenario | null> {
  if (!isE2EBypass()) return null;
  try {
    const value = (await cookies()).get(discoveryScenarioCookie)?.value;
    return discoveryScenarioSchema.safeParse(value).data ?? null;
  } catch {
    return null;
  }
}
