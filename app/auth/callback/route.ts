import { NextResponse, type NextRequest } from "next/server";
import { createClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !hasSupabaseEnvironment()) return NextResponse.redirect(new URL("/login?error=oauth_callback", request.url), 303);
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/login?error=oauth_callback" : "/jobs", request.url), 303);
}
