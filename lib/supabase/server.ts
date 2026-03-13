import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/env";
import { createServerSupabaseFetch } from "@/lib/supabase/server-fetch";
import type { Database } from "@/lib/types";

export async function createServerSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    global: {
      fetch: createServerSupabaseFetch()
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      }
    }
  });
}
