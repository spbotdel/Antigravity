import type { MediaProvider } from "@/lib/types";

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export type MediaStorageBackend = "supabase" | "object_storage";

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

export function getMediaStorageBackend(): MediaStorageBackend {
  const rawValue = String(process.env.MEDIA_STORAGE_BACKEND || "supabase").trim().toLowerCase();
  if (rawValue === "object_storage") {
    return "object_storage";
  }

  return "supabase";
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function getObjectStorageEnv() {
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT || "https://storage.yandexcloud.net";
  const region = process.env.OBJECT_STORAGE_REGION || "ru-central1";
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  const forcePathStyle = parseBooleanEnv(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE, true);

  if (!bucket) {
    throw new Error("OBJECT_STORAGE_BUCKET не настроен.");
  }

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Ключи object storage не настроены.");
  }

  return {
    bucket,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle
  };
}

export function getFileBackedMediaProvider(): Extract<MediaProvider, "supabase_storage" | "object_storage"> {
  return getMediaStorageBackend() === "object_storage" ? "object_storage" : "supabase_storage";
}

export function getStorageBucket() {
  if (getMediaStorageBackend() === "object_storage") {
    return getObjectStorageEnv().bucket;
  }

  return process.env.NEXT_PUBLIC_STORAGE_BUCKET || "tree-photos";
}

