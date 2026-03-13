import type { MediaProvider, MediaStorageBackend, MediaUploadRolloutState, UploadMode, VariantUploadMode } from "@/lib/types";

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export function getShareLinkTokenEncryptionSecret() {
  const explicitSecret = process.env.SHARE_LINK_TOKEN_ENCRYPTION_KEY?.trim();
  if (explicitSecret) {
    return explicitSecret;
  }

  const fallbackSecret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (fallbackSecret) {
    return fallbackSecret;
  }

  throw new Error("Секрет для шифрования семейных ссылок не настроен.");
}

export function getResendEmailEnv() {
  const apiKey = process.env.RESEND_API_KEY?.trim() || null;
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || null;
  const replyTo = process.env.INVITE_EMAIL_REPLY_TO?.trim() || null;

  if (!apiKey || !fromEmail) {
    return null;
  }

  return {
    apiKey,
    fromEmail,
    replyTo,
  };
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

export function getMediaStorageBackend(): MediaStorageBackend {
  const rawValue = String(process.env.MEDIA_STORAGE_BACKEND || "supabase").trim().toLowerCase();
  if (rawValue === "cloudflare_r2") {
    return "cloudflare_r2";
  }
  if (rawValue === "object_storage") {
    return "object_storage";
  }

  return "supabase";
}

export function isObjectStorageLikeBackend(backend: MediaStorageBackend = getMediaStorageBackend()) {
  return backend === "object_storage" || backend === "cloudflare_r2";
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

function parseRolloutTimestamp(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function getLegacyObjectStorageEnv() {
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

export function getCloudflareR2Env() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const bucket = process.env.CF_R2_BUCKET;
  const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.CF_R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const region = process.env.CF_R2_REGION || "auto";
  const forcePathStyle = parseBooleanEnv(process.env.CF_R2_FORCE_PATH_STYLE, true);

  if (!accountId) {
    throw new Error("CF_ACCOUNT_ID не настроен.");
  }

  if (!bucket) {
    throw new Error("CF_R2_BUCKET не настроен.");
  }

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Ключи Cloudflare R2 не настроены.");
  }

  if (!endpoint) {
    throw new Error("CF_R2_ENDPOINT не настроен.");
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

export function shouldUseCloudflareR2ForMedia(createdAt?: string | null) {
  if (getMediaStorageBackend() !== "cloudflare_r2") {
    return false;
  }

  const rolloutAt = parseRolloutTimestamp(process.env.CF_R2_ROLLOUT_AT);
  if (rolloutAt === null && !process.env.CF_R2_ROLLOUT_AT) {
    return true;
  }

  if (!createdAt) {
    return false;
  }

  const mediaCreatedAt = Date.parse(createdAt);
  if (rolloutAt === null || !Number.isFinite(mediaCreatedAt)) {
    return false;
  }

  return mediaCreatedAt >= rolloutAt;
}

export function shouldUseCloudflareR2ForNewMedia(nowMs = Date.now()) {
  if (getMediaStorageBackend() !== "cloudflare_r2") {
    return false;
  }

  const rolloutAt = parseRolloutTimestamp(process.env.CF_R2_ROLLOUT_AT);
  if (rolloutAt === null) {
    return !process.env.CF_R2_ROLLOUT_AT;
  }

  return nowMs >= rolloutAt;
}

export function shouldForceProxyMediaUpload() {
  return parseBooleanEnv(process.env.MEDIA_UPLOAD_FORCE_PROXY, false);
}

export function resolveMediaUploadTransport(options?: {
  backend?: MediaStorageBackend;
  useCloudflareForNewMedia?: boolean;
  hasVariants?: boolean;
}): {
  uploadMode: UploadMode;
  variantUploadMode: VariantUploadMode;
} {
  const plan = resolveMediaUploadPlan(options);
  return {
    uploadMode: plan.uploadMode,
    variantUploadMode: plan.variantUploadMode,
  };
}

export function resolveMediaUploadPlan(options?: {
  backend?: MediaStorageBackend;
  useCloudflareForNewMedia?: boolean;
  hasVariants?: boolean;
}): {
  configuredBackend: MediaStorageBackend;
  resolvedUploadBackend: MediaStorageBackend;
  rolloutState: MediaUploadRolloutState;
  forceProxyUpload: boolean;
  uploadMode: UploadMode;
  variantUploadMode: VariantUploadMode;
} {
  const configuredBackend = options?.backend ?? getMediaStorageBackend();
  const useCloudflareForNewMedia = options?.useCloudflareForNewMedia ?? shouldUseCloudflareR2ForNewMedia();
  const hasVariants = Boolean(options?.hasVariants);
  const forceProxyUpload = shouldForceProxyMediaUpload();

  const resolvedUploadBackend =
    configuredBackend === "cloudflare_r2" && !useCloudflareForNewMedia ? "object_storage" : configuredBackend;
  const rolloutState: MediaUploadRolloutState =
    configuredBackend !== "cloudflare_r2"
      ? "steady_state"
      : useCloudflareForNewMedia
        ? "cloudflare_rollout_active"
        : "cloudflare_rollout_gated";

  return {
    configuredBackend,
    resolvedUploadBackend,
    rolloutState,
    forceProxyUpload,
    uploadMode: resolvedUploadBackend === "cloudflare_r2" && !forceProxyUpload ? "direct" : "proxy",
    variantUploadMode: hasVariants ? "server_proxy" : "none",
  };
}

export function getObjectStorageEnvForMedia(createdAt?: string | null) {
  if (shouldUseCloudflareR2ForMedia(createdAt)) {
    return getCloudflareR2Env();
  }

  return getLegacyObjectStorageEnv();
}

export function getObjectStorageEnvForNewMedia(nowMs = Date.now()) {
  if (shouldUseCloudflareR2ForNewMedia(nowMs)) {
    return getCloudflareR2Env();
  }

  return getLegacyObjectStorageEnv();
}

export function getObjectStorageEnv() {
  if (getMediaStorageBackend() === "cloudflare_r2") {
    return getCloudflareR2Env();
  }

  return getLegacyObjectStorageEnv();
}

export function getFileBackedMediaProvider(): Extract<MediaProvider, "supabase_storage" | "object_storage"> {
  return isObjectStorageLikeBackend() ? "object_storage" : "supabase_storage";
}

export function getStorageBucket() {
  if (isObjectStorageLikeBackend()) {
    return getObjectStorageEnv().bucket;
  }

  return process.env.NEXT_PUBLIC_STORAGE_BUCKET || "tree-photos";
}

