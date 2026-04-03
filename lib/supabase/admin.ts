import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceEnv } from "@/lib/env";
import { createServerSupabaseFetch } from "@/lib/supabase/server-fetch";
import type { Database } from "@/lib/types";

let adminClient: ReturnType<typeof createClient<Database>> | null = null;
let adminStorageClient: ReturnType<typeof createClient<Database>> | null = null;

export function createAdminSupabaseClient() {
  if (!adminClient) {
    const { url, serviceRoleKey } = getSupabaseServiceEnv();
    adminClient = createClient<Database>(url, serviceRoleKey, {
      global: {
        fetch: createServerSupabaseFetch()
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return adminClient;
}

export function createAdminSupabaseStorageClient() {
  if (!adminStorageClient) {
    const { url, serviceRoleKey } = getSupabaseServiceEnv();
    adminStorageClient = createClient<Database>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return adminStorageClient;
}
