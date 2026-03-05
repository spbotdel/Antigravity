import { createServerSupabaseClient } from "@/lib/supabase/server";

interface ServerAuthUser {
  id: string;
  email: string | null;
}

function getDevImpersonatedUser(): ServerAuthUser | null {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const userId = process.env.DEV_IMPERSONATE_USER_ID?.trim();
  if (!userId) {
    return null;
  }

  return {
    id: userId,
    email: process.env.DEV_IMPERSONATE_USER_EMAIL?.trim() || "dev-impersonated@localhost"
  };
}

export async function getCurrentUser(): Promise<ServerAuthUser | null> {
  const impersonatedUser = getDevImpersonatedUser();
  if (impersonatedUser) {
    return impersonatedUser;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.user) {
      return null;
    }

    return {
      id: data.session.user.id,
      email: data.session.user.email ?? null
    };
  } catch {
    return null;
  }
}

export async function requireAuthenticatedUserId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}
