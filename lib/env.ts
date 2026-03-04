export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Публичные переменные окружения Supabase не настроены.");
  }

  return { url, anonKey };
}

export function getSupabaseServiceEnv() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!serviceRoleKey) {
    throw new Error("Секретный серверный ключ Supabase не настроен.");
  }

  if (serviceRoleKey.startsWith("sb_secret_")) {
    throw new Error(
      "Для серверных операций нужен legacy SUPABASE_SERVICE_ROLE_KEY из Settings > API > Legacy API Keys. Текущий sb_secret_* ключ не подходит для этого backend-пути."
    );
  }

  return { ...getSupabaseEnv(), serviceRoleKey };
}

export function getStorageBucket() {
  return process.env.NEXT_PUBLIC_STORAGE_BUCKET || "tree-photos";
}

