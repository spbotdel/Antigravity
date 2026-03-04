import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabase/route";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  const supabase = await createRouteSupabaseClient();
  await supabase.auth.exchangeCodeForSession(code);

  return NextResponse.redirect(`${origin}${next}`);
}
