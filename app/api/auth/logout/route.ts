import { createRouteSupabaseClient } from "@/lib/supabase/route";
import { toErrorResponse } from "@/lib/server/errors";

export async function POST() {
  try {
    const supabase = await createRouteSupabaseClient();
    await supabase.auth.signOut();
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
