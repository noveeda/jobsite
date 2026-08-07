import { isE2EBypass, isE2ERateLimitTestSupport } from "@/lib/environment";
import { NextResponse } from "next/server";
import { updateTracking } from "@/app/(dashboard)/jobs/tracking-actions";
import { applicationStatusSchema } from "@/lib/validation/jobs";
import { deleteTestJob, getTestJob, resetTestJob, restoreTestJob, updateTestJob } from "@/lib/e2e/job-store";
import { getE2ERateLimit } from "@/lib/e2e/rate-limit-store";

function disabled() {
  return !isE2EBypass();
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (disabled()) return new NextResponse(null, { status: 404 });
  return NextResponse.json(getTestJob((await params).id));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (disabled()) return new NextResponse(null, { status: 404 });
  const { id } = await params;
  const body = await request.json();
  try {
    const fixture = isE2ERateLimitTestSupport() ? getE2ERateLimit("mutation_write") : null;
    if (fixture && !fixture.allowed) {
      const applicationStatus = applicationStatusSchema.parse(body.applicationStatus);
      const formData = new FormData();
      formData.set("jobId", id);
      formData.set("status", applicationStatus);
      formData.set("memo", String(body.memo ?? ""));
      formData.set("nextActionAt", body.nextActionAt ? String(body.nextActionAt) : "");
      formData.set("deviceId", String(body.deviceId));
      const actionState = await updateTracking(null, formData);
      if (actionState?.ok) throw new Error("rate-limit fixture was not enforced");
      return NextResponse.json(
        { code: fixture.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED", message: actionState?.message },
        { status: fixture.unavailable ? 503 : 429, headers: { "retry-after": String(fixture.retryAfter) } },
      );
    }
    if (body.action === "restore") {
      return NextResponse.json(restoreTestJob(id, String(body.revisionId), String(body.deviceId)));
    }
    if (body.action === "delete") {
      return NextResponse.json(deleteTestJob(id, String(body.deviceId)));
    }
    const applicationStatus = applicationStatusSchema.parse(body.applicationStatus);
    return NextResponse.json(updateTestJob(id, {
      applicationStatus,
      memo: String(body.memo ?? ""),
      nextActionAt: body.nextActionAt ? String(body.nextActionAt) : null,
    }, String(body.deviceId)));
  } catch {
    return NextResponse.json({ message: "invalid request" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (disabled()) return new NextResponse(null, { status: 404 });
  return NextResponse.json(resetTestJob((await params).id));
}