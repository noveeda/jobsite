import { NextResponse } from "next/server";
import { isE2EBypass } from "@/lib/environment";
import { setE2EConsentScenario, type E2EConsentScenario } from "@/lib/e2e/consent-store";

const scenarios = new Set<E2EConsentScenario>(["accepted", "missing", "write_failure", "version_changed"]);

export async function POST(request: Request) {
  if (!isE2EBypass()) return new NextResponse(null, { status: 404 });
  const scenario = String((await request.json().catch(() => null))?.scenario ?? "") as E2EConsentScenario;
  if (!scenarios.has(scenario)) {
    return NextResponse.json({ code: "INVALID_SCENARIO" }, { status: 400 });
  }
  setE2EConsentScenario(scenario);
  return NextResponse.json({ ok: true });
}
