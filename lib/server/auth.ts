import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return null;
    }

    return data.session?.user ?? null;
  } catch {
    return null;
  }
}
