import { NextResponse } from "next/server";
import { z } from "zod";
import { isE2ERateLimitTestSupport } from "@/lib/environment";
import { resetE2ERateLimits, setE2ERateLimit } from "@/lib/e2e/rate-limit-store";

const requestSchema = z.strictObject({
  action: z.enum(["source_preview", "source_refresh", "import_validate", "import_commit", "account_delete", "consent_write", "mutation_write"]),
  mode: z.enum(["denied", "unavailable"]),
});

function disabled() {
  return !isE2ERateLimitTestSupport();
}

export async function POST(request: Request) {
  if (disabled()) return new NextResponse(null, { status: 404 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "invalid request" }, { status: 400 });
  setE2ERateLimit(parsed.data.action, parsed.data.mode);
  return new NextResponse(null, { status: 204 });
}

export async function DELETE() {
  if (disabled()) return new NextResponse(null, { status: 404 });
  resetE2ERateLimits();
  return new NextResponse(null, { status: 204 });
}