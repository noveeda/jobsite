import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { collectCatalog } from "@/lib/collection/collect";
import { validateServerEnvironment } from "@/lib/environment";
import { logSafeEvent, requestId } from "@/lib/observability/safe-logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const requestSchema = z.object({
  provider: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64).optional(),
  reason: z.literal("scheduled"),
}).strict();

function authorized(header: string | null, secret: string) {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function json(body: Record<string, unknown>, status: number, id: string) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": id },
  });
}

export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const started = performance.now();
  if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", requestId: id }, 405, id);

  let environment: ReturnType<typeof validateServerEnvironment>;
  try {
    environment = validateServerEnvironment();
  } catch {
    logSafeEvent({ requestId: id, category: "collector.cron", outcome: "denied", errorCode: "CONFIGURATION_INVALID" });
    return json({ code: "COLLECTOR_UNAVAILABLE", requestId: id }, 503, id);
  }
  const secret = process.env.CRON_SECRET;
  if (!environment.automaticDiscoveryEnabled || !environment.collectorEnabled || !secret) {
    logSafeEvent({ requestId: id, category: "collector.cron", outcome: "denied", errorCode: "COLLECTOR_DISABLED" });
    return json({ code: "COLLECTOR_UNAVAILABLE", requestId: id }, 503, id);
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    logSafeEvent({ requestId: id, category: "collector.cron", outcome: "denied", errorCode: "CRON_AUTH_INVALID" });
    return json({ code: "UNAUTHORIZED", requestId: id }, 401, id);
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return json({ code: "INVALID_REQUEST", requestId: id }, 400, id);
  }

  try {
    const client = createAdminClient();
    const result = await collectCatalog({
      reason: body.reason,
      providerCode: body.provider,
      now: new Date(),
      client,
    });
    if (result.claimFailures.length > 0) {
      logSafeEvent({
        requestId: id,
        category: "collector.cron",
        outcome: "failure",
        errorCode: "COLLECTION_CLAIM_PARTIAL",
        durationMs: performance.now() - started,
      });
    } else {
      logSafeEvent({
        requestId: id,
        category: "collector.cron",
        outcome: "success",
        durationMs: performance.now() - started,
      });
    }
    return json({
      requestId: id,
      runs: result.runs,
      ...(result.claimFailures.length === 0 ? {} : {
        claimFailureCount: result.claimFailures.length,
        claimFailures: result.claimFailures,
      }),
    }, 200, id);
  } catch (error) {
    if (error instanceof Error && error.message === "SOURCE_PROVIDER_UNKNOWN") {
      return json({ code: "UNKNOWN_PROVIDER", requestId: id }, 400, id);
    }
    logSafeEvent({
      requestId: id,
      category: "collector.cron",
      outcome: "failure",
      errorCode: "COLLECTION_FAILED",
      durationMs: performance.now() - started,
    });
    return json({ code: "COLLECTION_FAILED", requestId: id }, 500, id);
  }
}
