import { NextResponse } from "next/server";
import { applicationStatusSchema } from "@/lib/validation/jobs";
import { deleteTestJob, getTestJob, resetTestJob, restoreTestJob, updateTestJob } from "@/lib/e2e/job-store";

function disabled() {
  return process.env.E2E_BYPASS_AUTH !== "true";
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