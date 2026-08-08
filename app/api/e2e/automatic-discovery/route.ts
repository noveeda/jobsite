import { NextResponse, type NextRequest } from "next/server";

import {
  discoveryScenarioCookie,
  discoveryScenarioSchema,
} from "@/lib/e2e/automatic-discovery";
import { isE2EBypass } from "@/lib/environment";

export async function POST(request: NextRequest) {
  if (!isE2EBypass()) return new NextResponse(null, { status: 404 });
  const body = discoveryScenarioSchema.safeParse((await request.json()).scenario);
  if (!body.success) return NextResponse.json({ message: "invalid scenario" }, { status: 400 });

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(discoveryScenarioCookie, body.data, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return response;
}