import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/env";
import { createSupabaseFetch } from "@/lib/supabase/fetch";
import type { Database } from "@/lib/types";

export async function createServerSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    global: {
      fetch: createSupabaseFetch()
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      }
    }
  });
}
