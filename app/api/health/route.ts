import { NextResponse } from "next/server";
import { validateServerEnvironment } from "@/lib/environment";
import { logSafeEvent, requestId } from "@/lib/observability/safe-logger";

const TIMEOUT_MS = 1800;

export async function GET(request: Request) {
  const started = performance.now();
  const id = requestId(request.headers.get("x-request-id"));
  const timestamp = new Date().toISOString();
  const version = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "development").slice(0, 40);
  let configurationHealthy = true;
  let discovery = { automatic: false, collector: false, saramin: false };
  try {
    const environment = validateServerEnvironment();
    discovery = {
      automatic: environment.automaticDiscoveryEnabled,
      collector: environment.collectorEnabled,
      saramin: environment.saraminConnectorEnabled,
    };
  } catch {
    configurationHealthy = false;
  }
  let healthy = false;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      const response = await fetch(`${url}/rest/v1/`, {
        method: "HEAD",
        headers: { apikey: key, authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      healthy = response.ok;
    }
  } catch {
    healthy = false;
  }
  const overallHealthy = healthy && configurationHealthy;
  logSafeEvent({
    requestId: id,
    category: "health",
    outcome: overallHealthy ? "success" : "failure",
    errorCode: !configurationHealthy ? "CONFIGURATION_INVALID" : healthy ? undefined : "DATABASE_UNAVAILABLE",
    durationMs: performance.now() - started,
  });
  return NextResponse.json(
    {
      status: overallHealthy ? "ok" : "unavailable",
      database: healthy ? "ok" : "unavailable",
      configuration: configurationHealthy ? "ok" : "invalid",
      discovery,
      timestamp,
      version,
    },
    { status: overallHealthy ? 200 : 503, headers: { "cache-control": "no-store", "x-request-id": id } },
  );
}
