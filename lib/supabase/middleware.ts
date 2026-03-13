import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/env";
import { createServerSupabaseFetch } from "@/lib/supabase/server-fetch";
import type { Database } from "@/lib/types";

export async function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabaseEnv();
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient<Database>(url, anonKey, {
    global: {
      fetch: createServerSupabaseFetch()
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookieValues) {
        cookieValues.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookieValues.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  await supabase.auth.getUser();

  return response;
}
