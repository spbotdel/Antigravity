import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/env";
import { createSupabaseFetch } from "@/lib/supabase/fetch";
import type { Database } from "@/lib/types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createBrowserSupabaseClient() {
  if (!client) {
    const { url, anonKey } = getSupabaseEnv();
    client = createBrowserClient<Database>(url, anonKey, {
      global: {
        fetch: createSupabaseFetch()
      }
    });
  }

  return client;
}
