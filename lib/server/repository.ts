import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  AuditEntry,
  AuditEntryView,
  InviteRecord,
  MediaAssetRecord,
  MediaUploadTargetResponse,
  MediaAssetVariantRecord,
  MediaVariantName,
  MembershipRecord,
  PaginatedAuditEntryView,
  PersonMediaRecord,
  PersonRecord,
  PartnershipRecord,
  ParentLinkRecord,
  Profile,
  ShareLinkRecord,
  TreeRecord,
  TreeMediaAlbumItemRecord,
  TreeMediaAlbumRecord,
  TreeSnapshot,
  UserRole,
  ViewerActor
} from "@/lib/types";
import { buildAuditEntryViews } from "@/lib/audit-presenter";
import { buildViewerActor, canSeeMedia, hasRequiredRole, normalizeMembershipRole, resolveTreeRole } from "@/lib/permissions";
import { getBaseUrl, getFileBackedMediaProvider, getObjectStorageEnv, getObjectStorageEnvForMedia, getObjectStorageEnvForNewMedia, getResendEmailEnv, getShareLinkTokenEncryptionSecret, getStorageBucket, isObjectStorageLikeBackend, resolveMediaUploadPlan, shouldUseCloudflareR2ForNewMedia } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { fetchSupabaseAdminRestBatchJson, fetchSupabaseAdminRestJson, fetchSupabaseAdminRestJsonWithHeaders, parsePowerShellJsonStdout } from "@/lib/supabase/admin-rest";
import { getCurrentUser, requireAuthenticatedUserId } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";
import { createInviteToken, createOpaqueToken, decryptOpaqueToken, encryptOpaqueToken, hashInviteToken, hashOpaqueToken } from "@/lib/server/invite-token";
import { shouldUsePhotoVariants } from "@/lib/tree/display";

const admin = () => createAdminSupabaseClient();
const objectStorageClients = new Map<string, S3Client>();
const execFileAsync = promisify(execFile);
const OBJECT_STORAGE_HTTP_MAX_BUFFER = 1024 * 1024 * 4;
const SIGNED_HTTP_TIMEOUT_MS = 15000;
const SIGNED_HTTP_FALLBACK_ERROR_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND"]);
const PHOTO_VARIANT_NAMES: MediaVariantName[] = ["thumb", "small", "medium"];

const REPOSITORY_NETWORK_ERROR_MARKERS = ["SUPABASE_UNAVAILABLE", "fetch failed", "connect timeout", "timed out", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"];
const SHARE_LINKS_SCHEMA_CACHE_MARKERS = ["tree_share_links", "schema cache"];
const SHARE_LINK_REVEAL_COLUMN_MARKERS = ["token_ciphertext"];
const MEDIA_VARIANTS_SCHEMA_CACHE_MARKERS = ["media_asset_variants", "schema cache"];
const MEDIA_ALBUMS_SCHEMA_CACHE_MARKERS = ["tree_media_albums", "schema cache"];
const MEDIA_ALBUM_ITEMS_SCHEMA_CACHE_MARKERS = ["tree_media_album_items", "schema cache"];
const SHARE_LINK_PUBLIC_SELECT = "id,tree_id,label,token_hash,expires_at,revoked_at,last_accessed_at,created_by,created_at";
const SHARE_LINK_REVEAL_SELECT = `${SHARE_LINK_PUBLIC_SELECT},token_ciphertext,tree:trees!inner(id,slug)`;
const RESEND_SEND_EMAIL_URL = "https://api.resend.com/emails";
const USER_ROLE_STRENGTH: Record<UserRole, number> = {
  viewer: 0,
  admin: 1,
  owner: 2
};

function toRepositoryReadError(error: unknown, fallbackMessage: string) {
  if (error instanceof AppError) {
    return error;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  if (REPOSITORY_NETWORK_ERROR_MARKERS.some((marker) => message.includes(marker))) {
    return new AppError(503, "Сервер не смог связаться с Supabase. Попробуйте еще раз.");
  }

  return new AppError(500, message || fallbackMessage);
}

function isShareLinksSchemaUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return SHARE_LINKS_SCHEMA_CACHE_MARKERS.every((marker) => message.includes(marker));
}

function isShareLinkRevealColumnUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return SHARE_LINK_REVEAL_COLUMN_MARKERS.every((marker) => message.includes(marker));
}

function isMediaVariantsSchemaUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return MEDIA_VARIANTS_SCHEMA_CACHE_MARKERS.every((marker) => message.includes(marker));
}

function isMediaAlbumsSchemaUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return MEDIA_ALBUMS_SCHEMA_CACHE_MARKERS.every((marker) => message.includes(marker));
}

function mergeInviteAcceptanceRole(currentRole: UserRole | null, inviteRole: UserRole) {
  if (!currentRole) {
    return inviteRole;
  }

  return USER_ROLE_STRENGTH[currentRole] >= USER_ROLE_STRENGTH[inviteRole] ? currentRole : inviteRole;
}

interface ShareLinkRevealRecord extends ShareLinkRecord {
  tree?: Pick<TreeRecord, "id" | "slug"> | null;
}

function toPublicShareLinkRecord(shareLink: ShareLinkRecord | ShareLinkRevealRecord) {
  const { token_ciphertext: _tokenCiphertext, tree: _tree, ...publicShareLink } = shareLink as ShareLinkRevealRecord;
  return publicShareLink;
}

function buildShareLinkUrl(treeSlug: string, token: string) {
  return `${getBaseUrl()}/tree/${treeSlug}?share=${encodeURIComponent(token)}`;
}

async function sendInviteEmailIfConfigured(input: {
  inviteMethod: "link" | "email";
  email: string | null;
  inviteUrl: string;
  treeTitle: string;
  role: UserRole;
  expiresAt: string;
}) {
  if (input.inviteMethod !== "email" || !input.email) {
    return {
      deliveryStatus: "skipped" as const,
      deliveryMessage: null,
    };
  }

  const resendEnv = getResendEmailEnv();
  if (!resendEnv) {
    return {
      deliveryStatus: "skipped" as const,
      deliveryMessage: "Resend пока не настроен. Ссылка приглашения сохранена, ее можно отправить вручную."
    };
  }

  const expiresLabel = new Date(input.expiresAt).toLocaleString("ru-RU");
  const roleLabel = input.role === "admin" ? "администратор" : "участник";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#182130">
      <h2 style="margin:0 0 12px">Приглашение в семейное дерево "${input.treeTitle}"</h2>
      <p style="margin:0 0 12px">Вам открыт доступ в роли: <strong>${roleLabel}</strong>.</p>
      <p style="margin:0 0 12px">Срок действия приглашения: <strong>${expiresLabel}</strong>.</p>
      <p style="margin:0 0 18px">Нажмите на кнопку ниже, чтобы принять приглашение.</p>
      <p style="margin:0 0 18px">
        <a href="${input.inviteUrl}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#f06d3d;color:#fff8f3;text-decoration:none;font-weight:700">
          Открыть приглашение
        </a>
      </p>
      <p style="margin:0;color:#5d6e8a">Если кнопка не работает, откройте ссылку вручную:</p>
      <p style="margin:6px 0 0;word-break:break-word">${input.inviteUrl}</p>
    </div>
  `.trim();

  const response = await fetch(RESEND_SEND_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendEnv.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendEnv.fromEmail,
      to: [input.email],
      reply_to: resendEnv.replyTo || undefined,
      subject: `Приглашение в семейное дерево "${input.treeTitle}"`,
      html,
      text: `Вам открыт доступ в семейное дерево "${input.treeTitle}" в роли "${roleLabel}".\n\nСрок действия: ${expiresLabel}.\n\nПримите приглашение по ссылке: ${input.inviteUrl}`
    }),
  }).catch((error) => {
    console.error("[invite-email] resend request failed", error);
    return null;
  });

  if (!response) {
    return {
      deliveryStatus: "failed" as const,
      deliveryMessage: "Письмо не отправлено из-за сетевой ошибки. Ссылка приглашения сохранена, ее можно отправить вручную."
    };
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    console.error("[invite-email] resend returned non-ok response", payload);
    return {
      deliveryStatus: "failed" as const,
      deliveryMessage: "Письмо не отправлено. Ссылка приглашения сохранена, ее можно отправить вручную."
    };
  }

  return {
    deliveryStatus: "sent" as const,
    deliveryMessage: `Письмо отправлено на ${input.email}.`
  };
}

function isMediaAlbumItemsSchemaUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return MEDIA_ALBUM_ITEMS_SCHEMA_CACHE_MARKERS.every((marker) => message.includes(marker));
}

function buildUuidInFilter(values: string[]) {
  return `(${[...new Set(values.filter(Boolean))].join(",")})`;
}

function parseContentRangeTotal(value: string | undefined) {
  if (!value) {
    return null;
  }

  const match = /\/(\d+)$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchAdminRows<T>(pathWithQuery: string, fallbackMessage: string) {
  try {
    const data = await fetchSupabaseAdminRestJson<T[]>(pathWithQuery);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw toRepositoryReadError(error, fallbackMessage);
  }
}

async function fetchAdminFirst<T>(pathWithQuery: string, fallbackMessage: string) {
  const rows = await fetchAdminRows<T>(`${pathWithQuery}${pathWithQuery.includes("?") ? "&" : "?"}limit=1`, fallbackMessage);
  return rows[0] ?? null;
}

async function mutateAdminRows<T>(pathWithQuery: string, method: "POST" | "PATCH" | "DELETE", body: unknown, fallbackMessage: string) {
  try {
    const data = await fetchSupabaseAdminRestJson<T[] | null>(pathWithQuery, { method, body });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw toRepositoryReadError(error, fallbackMessage);
  }
}

async function mutateAdminFirst<T>(pathWithQuery: string, method: "POST" | "PATCH", body: unknown, fallbackMessage: string) {
  const rows = await mutateAdminRows<T>(pathWithQuery, method, body, fallbackMessage);
  return rows[0] ?? null;
}

async function getAuthenticatedUserId() {
  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    throw new AppError(401, "Требуется авторизация.");
  }

  return userId;
}

export async function getTreeBySlug(slug: string) {
  const data = await fetchAdminFirst<TreeRecord>(
    `trees?select=*&slug=eq.${encodeURIComponent(slug)}`,
    "Не удалось загрузить семейное дерево."
  );

  if (!data) {
    throw new AppError(404, "Семейное дерево не найдено.");
  }

  return data;
}

export async function getTreeById(treeId: string) {
  const data = await fetchAdminFirst<TreeRecord>(
    `trees?select=*&id=eq.${encodeURIComponent(treeId)}`,
    "Не удалось загрузить семейное дерево."
  );

  if (!data) {
    throw new AppError(404, "Семейное дерево не найдено.");
  }

  return data;
}

// FRAMEWORK_RULE: Tree pages should prefer specialized repository page-data loaders over full snapshots unless rendering truly needs the whole snapshot contract.

export async function getMembership(treeId: string, userId: string) {
  return fetchAdminFirst<MembershipRecord>(
    `tree_memberships?select=*&tree_id=eq.${encodeURIComponent(treeId)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`,
    "Не удалось проверить права доступа к дереву."
  );
}

function createSyntheticOwnerMembership(tree: TreeRecord, userId: string): MembershipRecord {
  return {
    id: `synthetic-owner-${tree.id}`,
    tree_id: tree.id,
    user_id: userId,
    role: "owner",
    status: "active",
    created_at: tree.created_at
  };
}

export async function requireTreeRole(treeId: string, allowedRoles: UserRole[]) {
  const userId = await getAuthenticatedUserId();
  const [tree, membership] = await Promise.all([getTreeById(treeId), getMembership(treeId, userId)]);
  const effectiveRole = resolveTreeRole({
    userId,
    treeOwnerUserId: tree.owner_user_id,
    membershipRole: membership?.role ?? null
  });

  if (!hasRequiredRole(effectiveRole, allowedRoles)) {
    throw new AppError(403, "У вас нет доступа к этому действию в дереве.");
  }

  return {
    userId,
    membership: membership ? normalizeMembershipRole(membership, tree.owner_user_id) : createSyntheticOwnerMembership(tree, userId)
  };
}

export async function getActorForTree(treeId: string): Promise<ViewerActor> {
  const user = await getCurrentUser();
  if (!user) {
    return buildViewerActor(null, null);
  }

  const [tree, membership] = await Promise.all([getTreeById(treeId), getMembership(treeId, user.id)]);
  return buildViewerActor(
    user.id,
    resolveTreeRole({
      userId: user.id,
      treeOwnerUserId: tree.owner_user_id,
      membershipRole: membership?.role ?? null
    })
  );
}

async function getValidShareLink(treeId: string, shareToken?: string | null) {
  if (!shareToken) {
    return null;
  }

  const tokenHash = hashOpaqueToken(shareToken);
  let shareLink: ShareLinkRecord | null = null;
  try {
    shareLink = await fetchAdminFirst<ShareLinkRecord>(
      `tree_share_links?select=${SHARE_LINK_PUBLIC_SELECT}&tree_id=eq.${encodeURIComponent(treeId)}&token_hash=eq.${encodeURIComponent(tokenHash)}`,
      "Не удалось проверить семейную ссылку."
    );
  } catch (error) {
    if (isShareLinksSchemaUnavailableError(error)) {
      return null;
    }

    throw error;
  }

  if (!shareLink) {
    return null;
  }

  if (shareLink.revoked_at) {
    return null;
  }

  if (new Date(shareLink.expires_at).getTime() < Date.now()) {
    return null;
  }

  return shareLink;
}

function queueShareLinkAccessTouch(shareLinkId: string) {
  void mutateAdminFirst<ShareLinkRecord>(
    `tree_share_links?id=eq.${encodeURIComponent(shareLinkId)}&select=*`,
    "PATCH",
    { last_accessed_at: new Date().toISOString() },
    "Не удалось обновить время доступа по семейной ссылке."
  ).catch((error) => {
    if (isShareLinksSchemaUnavailableError(error)) {
      return;
    }
    console.error("[share-link] best-effort access touch failed", error);
  });
}

async function getTreeReadAccess(tree: TreeRecord, shareToken?: string | null, resolvedUser?: Awaited<ReturnType<typeof getCurrentUser>>) {
  const user = resolvedUser === undefined ? await getCurrentUser() : resolvedUser;
  const [membership, shareLink] = await Promise.all([
    user ? getMembership(tree.id, user.id) : Promise.resolve(null),
    getValidShareLink(tree.id, shareToken)
  ]);
  const hasShareLinkAccess = Boolean(shareLink);
  const effectiveRole = resolveTreeRole({
    userId: user?.id ?? null,
    treeOwnerUserId: tree.owner_user_id,
    membershipRole: membership?.role ?? null
  });
  const hasMembershipAccess = Boolean(
    effectiveRole && (membership?.status === "active" || (user?.id ?? null) === tree.owner_user_id)
  );

  if (!(tree.visibility === "public" || hasShareLinkAccess || hasMembershipAccess)) {
    if (shareToken) {
      throw new AppError(403, "Ссылка для семейного просмотра недействительна или истекла.");
    }

    throw new AppError(403, "Это закрытое дерево. Войдите в аккаунт по приглашению.");
  }

  const accessSource =
    effectiveRole != null ? "membership" : hasShareLinkAccess ? "share_link" : tree.visibility === "public" ? "public" : "anonymous";
  const actor = buildViewerActor(user?.id ?? null, effectiveRole, {
    accessSource,
    shareLinkId: shareLink?.id ?? null
  });

  return {
    actor,
    hasShareLinkAccess,
    membership: membership ? normalizeMembershipRole(membership, tree.owner_user_id) : null,
    shareLink,
    user
  };
}

function resolveMediaKindFromMimeType(mimeType: string): MediaAssetRecord["kind"] {
  const normalized = mimeType.trim().toLowerCase();

  if (normalized.startsWith("image/")) {
    return "photo";
  }

  if (normalized.startsWith("video/")) {
    return "video";
  }

  if (
    normalized === "application/pdf" ||
    normalized.startsWith("text/") ||
    normalized.includes("word") ||
    normalized.includes("officedocument") ||
    normalized.includes("spreadsheet") ||
    normalized.includes("presentation") ||
    normalized === "application/rtf"
  ) {
    return "document";
  }

  throw new AppError(400, "Этот тип файла пока не поддерживается.");
}

function getObjectStorageClient(config = getObjectStorageEnv()) {
  const cacheKey = [config.endpoint, config.region, config.accessKeyId, String(config.forcePathStyle)].join("|");
  const existing = objectStorageClients.get(cacheKey);
  if (existing) {
    return existing;
  }

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

  objectStorageClients.set(cacheKey, client);
  return client;
}

async function createObjectStorageSignedUploadUrl(storagePath: string, mimeType: string, config = getObjectStorageEnvForNewMedia()) {
  const signedUrl = await getSignedUrl(
    getObjectStorageClient(config),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: storagePath,
      ContentType: mimeType
    }),
    { expiresIn: 15 * 60 }
  );

  return {
    bucket: config.bucket,
    signedUrl,
    token: null,
    uploadProvider: "object_storage" as const
  };
}

async function createSignedUploadTargetForPath(storagePath: string, mimeType: string) {
  if (isObjectStorageLikeBackend()) {
    return createObjectStorageSignedUploadUrl(storagePath, mimeType, getObjectStorageEnvForNewMedia());
  }

  const { data, error } = await admin().storage.from(getStorageBucket()).createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data) {
    throw new AppError(400, error?.message || "Не удалось создать ссылку для загрузки.");
  }

  return {
    bucket: getStorageBucket(),
    signedUrl: data.signedUrl,
    token: data.token,
    uploadProvider: "supabase_storage" as const
  };
}

function buildPhotoVariantStoragePath(storagePath: string, variant: MediaVariantName) {
  const lastSlashIndex = storagePath.lastIndexOf("/");
  const baseDirectory = lastSlashIndex >= 0 ? storagePath.slice(0, lastSlashIndex) : storagePath;
  return `${baseDirectory}/variants/${variant}.webp`;
}

async function createObjectStorageSignedReadUrl(storagePath: string, config = getObjectStorageEnv()) {
  return getSignedUrl(
    getObjectStorageClient(config),
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: storagePath
    }),
    { expiresIn: 60 }
  );
}

class SignedHttpFallbackError extends Error {
  status: number;

  constructor(status: number, message: string, cause?: unknown) {
    super(message);
    this.name = "SignedHttpFallbackError";
    this.status = status;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function shouldUsePowerShellSignedHttpFallback(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause as { code?: string } | undefined;
  return error.message.includes("fetch failed") || (cause?.code ? SIGNED_HTTP_FALLBACK_ERROR_CODES.has(cause.code) : false);
}

function canUsePowerShellSignedHttpFallback() {
  return process.platform === "win32";
}

async function runNativeSignedHttpRequest(input: {
  url: string;
  method: "PUT" | "DELETE";
  contentType?: string;
  bodyBuffer?: Buffer;
}) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SIGNED_HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.contentType
        ? {
            "content-type": input.contentType
          }
        : undefined,
      body: input.bodyBuffer ? new Uint8Array(input.bodyBuffer) : undefined,
      signal: controller.signal
    });

    return { status: response.status };
  } catch (error) {
    if (timedOut) {
      throw new SignedHttpFallbackError(504, "Signed upload request timed out.", error);
    }

    if (shouldUsePowerShellSignedHttpFallback(error)) {
      throw new SignedHttpFallbackError(503, "Signed upload request failed.", error);
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function runPowerShellSignedHttpRequest(input: {
  url: string;
  method: "PUT" | "DELETE";
  contentType?: string;
  bodyBuffer?: Buffer;
}) {
  const payload = {
    url: input.url,
    method: input.method,
    headers: input.contentType
      ? {
          "content-type": input.contentType
        }
      : {},
    bodyBase64: input.bodyBuffer ? input.bodyBuffer.toString("base64") : "",
    timeoutMs: SIGNED_HTTP_TIMEOUT_MS
  };
  const payloadJson = JSON.stringify(payload);
  let payloadInput = Buffer.from(payloadJson, "utf8").toString("base64");
  let payloadFilePath: string | null = null;

  if (input.bodyBuffer) {
    payloadFilePath = path.join(os.tmpdir(), `antigravity-http-${crypto.randomUUID()}.json`);
    await fs.writeFile(payloadFilePath, payloadJson, "utf8");
    payloadInput = payloadFilePath;
  }

  const scriptPath = path.join(process.cwd(), "scripts", "supabase-http.ps1");
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, payloadInput],
      {
        maxBuffer: OBJECT_STORAGE_HTTP_MAX_BUFFER,
        timeout: SIGNED_HTTP_TIMEOUT_MS + 5000
      }
    );

    return parsePowerShellJsonStdout<{ status: number }>(stdout);
  } finally {
    if (payloadFilePath) {
      await fs.unlink(payloadFilePath).catch(() => {});
    }
  }
}

async function runSignedHttpRequest(input: {
  url: string;
  method: "PUT" | "DELETE";
  contentType?: string;
  bodyBuffer?: Buffer;
}) {
  try {
    return await runNativeSignedHttpRequest(input);
  } catch (error) {
    if (canUsePowerShellSignedHttpFallback() && error instanceof SignedHttpFallbackError) {
      try {
        return await runPowerShellSignedHttpRequest(input);
      } catch {
        return { status: error.status };
      }
    }

    if (error instanceof SignedHttpFallbackError) {
      return { status: error.status };
    }

    throw error;
  }
}

export async function uploadFileToSignedUrl(input: {
  signedUrl: string;
  contentType?: string;
  fileBuffer: Buffer;
}) {
  const result = await runSignedHttpRequest({
    url: input.signedUrl,
    method: "PUT",
    contentType: input.contentType,
    bodyBuffer: input.fileBuffer
  });

  if (result.status < 200 || result.status >= 300) {
    if (result.status >= 500) {
      throw new AppError(503, "Сервер не смог связаться с object storage. Попробуйте еще раз.");
    }
    throw new AppError(400, `Не удалось загрузить файл в storage (status ${result.status}).`);
  }
}

async function deleteObjectStorageObject(storagePath: string, config = getObjectStorageEnv()) {
  const deleteUrl = await getSignedUrl(
    getObjectStorageClient(config),
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: storagePath
    }),
    { expiresIn: 60 }
  );
  const result = await runSignedHttpRequest({
    url: deleteUrl,
    method: "DELETE"
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Object storage delete failed with status ${result.status}.`);
  }
}

function toObjectStorageError(error: unknown, fallbackMessage: string) {
  if (error instanceof AppError) {
    return error;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  if (REPOSITORY_NETWORK_ERROR_MARKERS.some((marker) => message.includes(marker))) {
    return new AppError(503, "Сервер не смог связаться с object storage. Попробуйте еще раз.");
  }

  return new AppError(500, message || fallbackMessage);
}

export async function listUserTrees(userId: string) {
  const membershipRows = await fetchAdminRows<MembershipRecord & { tree?: TreeRecord | null }>(
    `tree_memberships?select=*,tree:trees!inner(*)&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&order=created_at.asc`,
    "Не удалось загрузить список деревьев."
  );
  const membershipItems = membershipRows
    .map((row) => {
      const { tree, ...membership } = row;
      if (!tree) {
        return null;
      }

      return {
        membership: normalizeMembershipRole(membership, tree.owner_user_id),
        tree
      };
    })
    .filter((item): item is { membership: MembershipRecord; tree: TreeRecord } => item !== null);

  const ownedTrees = await fetchAdminRows<TreeRecord>(
    `trees?select=*&owner_user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc`,
    "Не удалось загрузить список деревьев."
  );
  const knownTreeIds = new Set(membershipItems.map((item) => item.tree.id));
  const syntheticOwnerItems = ownedTrees
    .filter((tree) => !knownTreeIds.has(tree.id))
    .map((tree) => ({
      membership: createSyntheticOwnerMembership(tree, userId),
      tree
    }));

  return [...membershipItems, ...syntheticOwnerItems].sort(
    (left, right) => left.tree.created_at.localeCompare(right.tree.created_at) || left.tree.id.localeCompare(right.tree.id)
  );
}

async function insertAuditLog(input: {
  treeId: string;
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
}) {
  await mutateAdminRows<never>(
    "audit_log",
    "POST",
    {
      tree_id: input.treeId,
      actor_user_id: input.actorUserId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      before_json: input.beforeJson,
      after_json: input.afterJson
    },
    "Не удалось записать событие в журнал изменений."
  );
}

function queueAuditLog(input: {
  treeId: string;
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
}) {
  void insertAuditLog(input).catch((error) => {
    console.error("[audit-log] best-effort insert failed", error);
  });
}

export async function createTreeForOwner(input: { title: string; slug: string; description?: string | null }) {
  const userId = await getAuthenticatedUserId();

  const { data: existingOwned, error: existingError } = await admin().from("trees").select("id").eq("owner_user_id", userId).limit(1);

  if (existingError) {
    throw new AppError(500, existingError.message);
  }

  if (existingOwned && existingOwned.length > 0) {
    throw new AppError(409, "В версии v1 владелец может создать только одно дерево.");
  }

  const { data: tree, error: treeError } = await admin()
    .from("trees")
    .insert({
      owner_user_id: userId,
      title: input.title,
      slug: input.slug,
      description: input.description || null,
      visibility: "private"
    })
    .select("*")
    .single<TreeRecord>();

  if (treeError || !tree) {
    throw new AppError(400, treeError?.message || "Не удалось создать дерево.");
  }

  const { error: membershipError } = await admin().from("tree_memberships").insert({
    tree_id: tree.id,
    user_id: userId,
    role: "owner",
    status: "active"
  });

  if (membershipError) {
    throw new AppError(500, membershipError.message);
  }

  await insertAuditLog({
    treeId: tree.id,
    actorUserId: userId,
    entityType: "tree",
    entityId: tree.id,
    action: "tree.created",
    beforeJson: null,
    afterJson: tree
  });

  return tree;
}

export async function updateTree(treeId: string, input: { title?: string; slug?: string; description?: string | null; rootPersonId?: string | null }) {
  const { userId } = await requireTreeRole(treeId, ["owner"]);
  const before = await getTreeById(treeId);

  const payload = {
    title: input.title ?? before.title,
    slug: input.slug ?? before.slug,
    description: input.description === undefined ? before.description : input.description,
    root_person_id: input.rootPersonId === undefined ? before.root_person_id : input.rootPersonId
  };

  const data = await mutateAdminFirst<TreeRecord>(
    `trees?id=eq.${encodeURIComponent(treeId)}&select=*`,
    "PATCH",
    payload,
    "Не удалось обновить дерево."
  );

  if (!data) {
    throw new AppError(400, "Не удалось обновить дерево.");
  }

  await insertAuditLog({
    treeId,
    actorUserId: userId,
    entityType: "tree",
    entityId: treeId,
    action: "tree.updated",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

export async function updateTreeVisibility(treeId: string, visibility: TreeRecord["visibility"]) {
  const { userId } = await requireTreeRole(treeId, ["owner"]);
  const before = await getTreeById(treeId);

  const data = await mutateAdminFirst<TreeRecord>(
    `trees?id=eq.${encodeURIComponent(treeId)}&select=*`,
    "PATCH",
    { visibility },
    "Не удалось изменить видимость дерева."
  );

  if (!data) {
    throw new AppError(400, "Не удалось изменить видимость дерева.");
  }

  await insertAuditLog({
    treeId,
    actorUserId: userId,
    entityType: "tree",
    entityId: treeId,
    action: "tree.visibility_changed",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

async function loadTreeSnapshot(slug: string, options?: { includeMedia?: boolean; shareToken?: string | null }): Promise<TreeSnapshot> {
  const includeMedia = options?.includeMedia ?? true;
  const { tree, actor, hasShareLinkAccess } = await getTreeAccessContext(slug, options?.shareToken);

  const batchedRequests: Array<{ key: string; pathWithQuery: string }> = [
    {
      key: "people",
      pathWithQuery: `persons?select=*&tree_id=eq.${encodeURIComponent(tree.id)}&order=full_name.asc`
    },
    {
      key: "parentLinks",
      pathWithQuery: `person_parent_links?select=*&tree_id=eq.${encodeURIComponent(tree.id)}`
    },
    {
      key: "partnerships",
      pathWithQuery: `person_partnerships?select=*&tree_id=eq.${encodeURIComponent(tree.id)}`
    }
  ];

  if (includeMedia) {
    batchedRequests.push({
      key: "media",
      pathWithQuery: `media_assets?select=*&tree_id=eq.${encodeURIComponent(tree.id)}&order=created_at.desc`
    });
    batchedRequests.push({
      key: "personMedia",
      pathWithQuery:
        `person_media?select=id,person_id,media_id,is_primary,persons!inner(tree_id)` +
        `&persons.tree_id=eq.${encodeURIComponent(tree.id)}`
    });
  }

  const batchedResults = await fetchSupabaseAdminRestBatchJson<unknown>(batchedRequests);
  const batchedRowsByKey = new Map(batchedRequests.map((request, index) => [request.key, batchedResults[index]] as const));
  const people = (batchedRowsByKey.get("people") as PersonRecord[] | undefined) || [];
  const parentLinks = (batchedRowsByKey.get("parentLinks") as ParentLinkRecord[] | undefined) || [];
  const partnerships = (batchedRowsByKey.get("partnerships") as PartnershipRecord[] | undefined) || [];
  const allMedia = includeMedia ? ((batchedRowsByKey.get("media") as MediaAssetRecord[] | undefined) || []) : [];
  const allPersonMedia =
    includeMedia
      ? (((batchedRowsByKey.get("personMedia") as Array<PersonMediaRecord & { persons?: unknown }> | undefined) || []).map((item) => ({
          id: item.id,
          person_id: item.person_id,
          media_id: item.media_id,
          is_primary: item.is_primary
        })) as PersonMediaRecord[])
      : [];

  const media = allMedia.filter((item) => canSeeMedia(actor.role, item.visibility, hasShareLinkAccess));
  const visibleMediaIds = new Set(media.map((item) => item.id));
  const personMedia = includeMedia ? allPersonMedia.filter((item) => visibleMediaIds.has(item.media_id)) : [];

  return {
    tree,
    actor,
    people,
    parentLinks,
    partnerships,
    media,
    personMedia
  };
}

export async function getTreeSnapshot(slug: string, options?: { includeMedia?: boolean; shareToken?: string | null }): Promise<TreeSnapshot> {
  return loadTreeSnapshot(slug, options);
}

export async function getBuilderSnapshot(slug: string, options?: { includeMedia?: boolean; shareToken?: string | null }): Promise<TreeSnapshot> {
  return loadTreeSnapshot(slug, {
    includeMedia: options?.includeMedia ?? false,
    shareToken: options?.shareToken ?? null
  });
}

async function getTreeAccessContext(slug: string, shareToken?: string | null) {
  const [tree, user] = await Promise.all([getTreeBySlug(slug), getCurrentUser()]);
  const { actor, hasShareLinkAccess, shareLink } = await getTreeReadAccess(tree, shareToken, user);

  if (shareLink) {
    queueShareLinkAccessTouch(shareLink.id);
  }

  return {
    tree,
    actor,
    hasShareLinkAccess
  };
}

export async function getTreeAuditPageContext(slug: string, options?: { shareToken?: string | null }) {
  const { tree, actor } = await getTreeAccessContext(slug, options?.shareToken);

  return {
    tree,
    actor
  };
}

async function listShareLinksForTree(treeId: string) {
  try {
    return await fetchAdminRows<ShareLinkRecord>(
      `tree_share_links?select=${SHARE_LINK_PUBLIC_SELECT}&tree_id=eq.${encodeURIComponent(treeId)}&order=created_at.desc`,
      "Не удалось загрузить семейные ссылки."
    );
  } catch (error) {
    if (isShareLinksSchemaUnavailableError(error)) {
      return [];
    }

    throw error;
  }
}

export async function listMemberships(treeId: string) {
  const tree = await getTreeById(treeId);
  await requireTreeRole(treeId, ["owner", "admin"]);
  const memberships = await fetchAdminRows<MembershipRecord>(
    `tree_memberships?select=*&tree_id=eq.${encodeURIComponent(treeId)}&order=created_at.asc`,
    "Не удалось загрузить список участников."
  );
  return memberships.map((membership) => normalizeMembershipRole(membership, tree.owner_user_id));
}

export async function listInvites(treeId: string) {
  await requireTreeRole(treeId, ["owner", "admin"]);
  return fetchAdminRows<InviteRecord>(
    `tree_invites?select=*&tree_id=eq.${encodeURIComponent(treeId)}&order=created_at.desc`,
    "Не удалось загрузить приглашения."
  );
}

export async function listShareLinks(treeId: string) {
  await requireTreeRole(treeId, ["owner", "admin"]);
  return listShareLinksForTree(treeId);
}

export async function getTreeMembersPageData(slug: string, options?: { shareToken?: string | null }) {
  const { tree, actor } = await getTreeAccessContext(slug, options?.shareToken);

  if (!actor.canManageMembers) {
    return {
      tree,
      actor,
      memberships: [] as MembershipRecord[],
      invites: [] as InviteRecord[],
      shareLinks: [] as ShareLinkRecord[]
    };
  }

  const memberDataRequests = [
    {
      pathWithQuery: `tree_memberships?select=*&tree_id=eq.${encodeURIComponent(tree.id)}&order=created_at.asc`
    },
    {
      pathWithQuery: `tree_invites?select=*&tree_id=eq.${encodeURIComponent(tree.id)}&order=created_at.desc`
    }
  ];
  let results: unknown[] = [];
  let shareLinks: ShareLinkRecord[] = [];

  try {
    const batchedResults = await fetchSupabaseAdminRestBatchJson<unknown>([
      ...memberDataRequests,
      {
        pathWithQuery: `tree_share_links?select=${SHARE_LINK_PUBLIC_SELECT}&tree_id=eq.${encodeURIComponent(tree.id)}&order=created_at.desc`
      }
    ]);
    results = batchedResults;
    shareLinks = (batchedResults[2] as ShareLinkRecord[] | undefined) || [];
  } catch (error) {
    if (!isShareLinksSchemaUnavailableError(error)) {
      throw toRepositoryReadError(error, "Не удалось загрузить данные участников.");
    }

    results = await fetchSupabaseAdminRestBatchJson<unknown>(memberDataRequests).catch((fallbackError) => {
      throw toRepositoryReadError(fallbackError, "Не удалось загрузить данные участников.");
    });
  }

  const memberships = ((results[0] as MembershipRecord[] | undefined) || []).map((membership) => normalizeMembershipRole(membership, tree.owner_user_id));
  const invites = (results[1] as InviteRecord[] | undefined) || [];

  return {
    tree,
    actor,
    memberships,
    invites,
    shareLinks
  };
}

export async function getTreeSettingsPageData(slug: string, options?: { shareToken?: string | null }) {
  const { tree, actor } = await getTreeAccessContext(slug, options?.shareToken);
  const people = await fetchAdminRows<PersonRecord>(
    `persons?select=*&tree_id=eq.${encodeURIComponent(tree.id)}&order=full_name.asc`,
    "Не удалось загрузить список людей для настроек дерева."
  );

  return {
    tree,
    actor,
    people
  };
}

export async function createShareLink(input: { treeId: string; treeSlug?: string | null; label?: string | null; expiresInDays: number }) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const tokenCiphertext = encryptOpaqueToken(token, getShareLinkTokenEncryptionSecret());
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const label = input.label?.trim() || "Семейный просмотр";

  let data: ShareLinkRecord | null = null;
  try {
    data = await mutateAdminFirst<ShareLinkRecord>(
      `tree_share_links?select=${SHARE_LINK_PUBLIC_SELECT}`,
      "POST",
      {
        tree_id: input.treeId,
        label,
        token_hash: tokenHash,
        token_ciphertext: tokenCiphertext,
        expires_at: expiresAt,
        created_by: userId
      },
      "Не удалось создать семейную ссылку."
    );
  } catch (error) {
    if (isShareLinkRevealColumnUnavailableError(error)) {
      data = await mutateAdminFirst<ShareLinkRecord>(
        `tree_share_links?select=${SHARE_LINK_PUBLIC_SELECT}`,
        "POST",
        {
          tree_id: input.treeId,
          label,
          token_hash: tokenHash,
          expires_at: expiresAt,
          created_by: userId
        },
        "Не удалось создать семейную ссылку."
      );
    } else if (isShareLinksSchemaUnavailableError(error)) {
      throw new AppError(503, "Семейные ссылки пока недоступны: миграция базы данных еще не применена.");
    } else {
      throw error;
    }
  }

  if (!data) {
    throw new AppError(400, "Не удалось создать семейную ссылку.");
  }

  const treeSlug = input.treeSlug?.trim() || (await getTreeById(input.treeId)).slug;

  queueAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "share_link",
    entityId: data.id,
    action: "share_link.created",
    beforeJson: null,
    afterJson: data
  });

  return {
    shareLink: data,
    token,
    url: buildShareLinkUrl(treeSlug, token)
  };
}

export async function revealShareLink(shareLinkId: string) {
  const [shareLink, user] = await Promise.all([
    (async () => {
      try {
        return await fetchAdminFirst<ShareLinkRevealRecord>(
          `tree_share_links?select=${SHARE_LINK_REVEAL_SELECT}&id=eq.${encodeURIComponent(shareLinkId)}`,
          "Не удалось загрузить семейную ссылку."
        );
      } catch (error) {
        if (isShareLinkRevealColumnUnavailableError(error)) {
          return await fetchAdminFirst<ShareLinkRevealRecord>(
            `tree_share_links?select=${SHARE_LINK_PUBLIC_SELECT},tree:trees!inner(id,slug)&id=eq.${encodeURIComponent(shareLinkId)}`,
            "Не удалось загрузить семейную ссылку."
          );
        }

        if (isShareLinksSchemaUnavailableError(error)) {
          throw new AppError(503, "Семейные ссылки пока недоступны: миграция базы данных еще не применена.");
        }

        throw error;
      }
    })(),
    getCurrentUser()
  ]);

  if (!user) {
    throw new AppError(401, "Требуется авторизация.");
  }

  if (!shareLink) {
    throw new AppError(404, "Семейная ссылка не найдена.");
  }

  const membership = await getMembership(shareLink.tree_id, user.id).catch((error) => {
    throw toRepositoryReadError(error, "Не удалось проверить права доступа к семейной ссылке.");
  });

  if (!membership || !hasRequiredRole(membership.role, ["owner", "admin"])) {
    throw new AppError(403, "У вас нет доступа к этому действию в дереве.");
  }

  const publicShareLink = toPublicShareLinkRecord(shareLink);
  if (!shareLink.token_ciphertext) {
    return {
      shareLink: publicShareLink,
      canReveal: false,
      url: null,
      message: "Эту ссылку нельзя показать повторно: база еще не обновлена под защищенное хранение адреса или ссылка создана до включения нового режима."
    };
  }

  try {
    const token = decryptOpaqueToken(shareLink.token_ciphertext, getShareLinkTokenEncryptionSecret());
    const treeSlug = shareLink.tree?.slug || (await getTreeById(shareLink.tree_id)).slug;

    return {
      shareLink: publicShareLink,
      canReveal: true,
      url: buildShareLinkUrl(treeSlug, token),
      message: "Семейная ссылка загружена."
    };
  } catch {
    return {
      shareLink: publicShareLink,
      canReveal: false,
      url: null,
      message: "Эту ссылку больше нельзя показать повторно. Выпустите новую ссылку, если нужен новый адрес."
    };
  }
}

export async function revokeShareLink(shareLinkId: string) {
  const [before, user] = await Promise.all([
    (async () => {
      try {
        return await fetchAdminFirst<ShareLinkRecord>(
          `tree_share_links?select=${SHARE_LINK_PUBLIC_SELECT}&id=eq.${encodeURIComponent(shareLinkId)}`,
          "Не удалось загрузить семейную ссылку."
        );
      } catch (error) {
        if (isShareLinksSchemaUnavailableError(error)) {
          throw new AppError(503, "Семейные ссылки пока недоступны: миграция базы данных еще не применена.");
        }

        throw error;
      }
    })(),
    getCurrentUser()
  ]);

  if (!user) {
    throw new AppError(401, "Требуется авторизация.");
  }

  let membership: MembershipRecord | null = null;
  try {
    if (before) {
      membership = await getMembership(before.tree_id, user.id);
    }
  } catch (error) {
    throw toRepositoryReadError(error, "Не удалось проверить права доступа к семейной ссылке.");
  }

  if (!before) {
    throw new AppError(404, "Семейная ссылка не найдена.");
  }

  if (before.revoked_at) {
    throw new AppError(409, "Семейная ссылка уже отозвана.");
  }

  if (!membership || !hasRequiredRole(membership.role, ["owner", "admin"])) {
    throw new AppError(403, "У вас нет доступа к этому действию в дереве.");
  }

  const userId = user.id;
  const revokedAt = new Date().toISOString();
  let data: ShareLinkRecord | null = null;
  try {
    data = await mutateAdminFirst<ShareLinkRecord>(
      `tree_share_links?id=eq.${encodeURIComponent(shareLinkId)}&select=${SHARE_LINK_PUBLIC_SELECT}`,
      "PATCH",
      { revoked_at: revokedAt },
      "Не удалось отозвать семейную ссылку."
    );
  } catch (error) {
    if (isShareLinksSchemaUnavailableError(error)) {
      throw new AppError(503, "Семейные ссылки пока недоступны: миграция базы данных еще не применена.");
    }

    throw error;
  }

  if (!data) {
    throw new AppError(400, "Не удалось отозвать семейную ссылку.");
  }

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "share_link",
    entityId: shareLinkId,
    action: "share_link.revoked",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

async function listTreeMediaAlbumsForTree(treeId: string) {
  let albums: TreeMediaAlbumRecord[] = [];
  try {
    albums = await fetchAdminRows<TreeMediaAlbumRecord>(
      `tree_media_albums?select=*&tree_id=eq.${encodeURIComponent(treeId)}&order=created_at.desc`,
      "Не удалось загрузить альбомы семейного архива."
    );
  } catch (error) {
    if (isMediaAlbumsSchemaUnavailableError(error)) {
      return {
        albums: [] as TreeMediaAlbumRecord[],
        items: [] as TreeMediaAlbumItemRecord[]
      };
    }

    throw error;
  }

  const albumIds = albums.map((album) => album.id);
  let items: TreeMediaAlbumItemRecord[] = [];
  if (albumIds.length > 0) {
    try {
      items = await fetchAdminRows<TreeMediaAlbumItemRecord>(
        `tree_media_album_items?select=*&album_id=in.${buildUuidInFilter(albumIds)}`,
        "Не удалось загрузить связи альбомов с материалами."
      );
    } catch (error) {
      if (!isMediaAlbumItemsSchemaUnavailableError(error)) {
        throw error;
      }
    }
  }

  return {
    albums,
    items
  };
}

export async function listTreeMediaAlbums(treeId: string, shareToken?: string | null) {
  const tree = await getTreeById(treeId);
  await getTreeReadAccess(tree, shareToken);
  return listTreeMediaAlbumsForTree(treeId);
}

async function listTreeMediaUploaderLabelsForUserIds(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueUserIds.length) {
    return new Map<string, string>();
  }

  const profiles = await fetchAdminRows<Pick<Profile, "id" | "email" | "display_name">>(
    `profiles?select=id,email,display_name&id=in.${buildUuidInFilter(uniqueUserIds)}`,
    "Не удалось загрузить имена загрузивших участников."
  );
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile] as const));

  return new Map(
    uniqueUserIds.map((userId) => {
      const profile = profilesById.get(userId) || null;
      return [
        userId,
        formatUploaderAlbumTitle({
          email: profile?.email || null,
          displayName: profile?.display_name || null
        })
      ] as const;
    })
  );
}

export async function listTreeMediaUploaderLabels(treeId: string, userIds: string[], shareToken?: string | null) {
  const tree = await getTreeById(treeId);
  await getTreeReadAccess(tree, shareToken);
  return listTreeMediaUploaderLabelsForUserIds(userIds);
}

export async function getTreeMediaPageData(slug: string, options?: { shareToken?: string | null }) {
  const { tree, actor, hasShareLinkAccess } = await getTreeAccessContext(slug, options?.shareToken);
  const [allMedia, albumData] = await Promise.all([
    fetchAdminRows<MediaAssetRecord>(
      `media_assets?select=*&tree_id=eq.${encodeURIComponent(tree.id)}&order=created_at.desc`,
      "Не удалось загрузить медиаархив дерева."
    ),
    listTreeMediaAlbumsForTree(tree.id)
  ]);
  const media = allMedia.filter((item) => canSeeMedia(actor.role, item.visibility, hasShareLinkAccess));
  const uploaderLabelsById = await listTreeMediaUploaderLabelsForUserIds(
    media.map((asset) => asset.created_by).filter((value): value is string => Boolean(value))
  );

  return {
    tree,
    actor,
    media,
    albums: albumData.albums,
    items: albumData.items,
    uploaderLabelsById
  };
}

function formatUploaderAlbumTitle(input: { email: string | null; displayName: string | null }) {
  const displayName = input.displayName?.trim();
  if (displayName) {
    return `От ${displayName}`;
  }

  const emailPrefix = input.email?.split("@")[0]?.trim();
  if (emailPrefix) {
    return `От ${emailPrefix}`;
  }

  return "От участника";
}

async function getProfileForUser(userId: string) {
  try {
    return await fetchAdminFirst<Pick<Profile, "id" | "email" | "display_name">>(
      `profiles?select=id,email,display_name&id=eq.${encodeURIComponent(userId)}`,
      "Не удалось загрузить профиль участника."
    );
  } catch {
    return null;
  }
}

export async function createTreeMediaAlbum(input: {
  treeId: string;
  title: string;
  description?: string | null;
  albumKind?: TreeMediaAlbumRecord["album_kind"];
  uploaderUserId?: string | null;
}) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);
  let data: TreeMediaAlbumRecord | null = null;
  try {
    data = await mutateAdminFirst<TreeMediaAlbumRecord>(
      "tree_media_albums",
      "POST",
      {
        tree_id: input.treeId,
        title: input.title,
        description: input.description || null,
        album_kind: input.albumKind || "manual",
        uploader_user_id: input.uploaderUserId || null,
        created_by: userId
      },
      "Не удалось создать альбом."
    );
  } catch (error) {
    if (isMediaAlbumsSchemaUnavailableError(error)) {
      throw new AppError(503, "Альбомы пока недоступны: миграция базы данных еще не применена.");
    }

    throw error;
  }

  if (!data) {
    throw new AppError(400, "Не удалось создать альбом.");
  }

  queueAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "media_album",
    entityId: data.id,
    action: "media_album.created",
    beforeJson: null,
    afterJson: data
  });

  return data;
}

async function ensureUploaderTreeMediaAlbum(treeId: string, userId: string, email: string | null) {
  const existing = await fetchAdminFirst<TreeMediaAlbumRecord>(
    `tree_media_albums?select=*&tree_id=eq.${encodeURIComponent(treeId)}&album_kind=eq.uploader&uploader_user_id=eq.${encodeURIComponent(userId)}`,
    "Не удалось загрузить автоальбом загрузившего."
  );

  if (existing) {
    return existing;
  }

  const profile = await getProfileForUser(userId);
  return createTreeMediaAlbum({
    treeId,
    title: formatUploaderAlbumTitle({
      email,
      displayName: profile?.display_name || null
    }),
    albumKind: "uploader",
    uploaderUserId: userId
  });
}

async function addMediaToTreeMediaAlbums(albumIds: string[], mediaId: string) {
  const uniqueAlbumIds = [...new Set(albumIds.filter(Boolean))];
  if (!uniqueAlbumIds.length) {
    return [];
  }

  return mutateAdminRows<TreeMediaAlbumItemRecord>(
    "tree_media_album_items",
    "POST",
    uniqueAlbumIds.map((albumId) => ({
      album_id: albumId,
      media_id: mediaId
    })),
    "Не удалось добавить материал в альбом."
  );
}

export async function listAudit(treeId: string, options?: { page?: number; pageSize?: number }): Promise<PaginatedAuditEntryView> {
  await requireTreeRole(treeId, ["owner"]);
  const page = Math.max(1, options?.page || 1);
  const pageSize = Math.min(100, Math.max(20, options?.pageSize || 50));
  const offset = (page - 1) * pageSize;
  const { data: entries, headers } = await fetchSupabaseAdminRestJsonWithHeaders<AuditEntry[]>(
    `audit_log?select=*&tree_id=eq.${encodeURIComponent(treeId)}&order=created_at.desc&limit=${pageSize}&offset=${offset}`,
    {
      headers: {
        prefer: "count=exact"
      }
    }
  ).catch((error) => {
    throw toRepositoryReadError(error, "Не удалось загрузить журнал изменений.");
  });
  const total = parseContentRangeTotal(headers["Content-Range"] || headers["content-range"]) ?? entries.length;
  if (!entries.length) {
    return {
      entries: [],
      total,
      page,
      pageSize
    };
  }

  const relatedUserIds = new Set<string>();
  const relatedPersonIds = new Set<string>();

  for (const entry of entries) {
    if (entry.actor_user_id) {
      relatedUserIds.add(entry.actor_user_id);
    }

    for (const snapshot of [entry.before_json, entry.after_json]) {
      if (!snapshot) {
        continue;
      }

      const userId = typeof snapshot.user_id === "string" ? snapshot.user_id : null;
      if (userId) {
        relatedUserIds.add(userId);
      }

      const personKeys = ["root_person_id", "parent_person_id", "child_person_id", "person_a_id", "person_b_id"];
      for (const key of personKeys) {
        const value = typeof snapshot[key] === "string" ? snapshot[key] : null;
        if (value) {
          relatedPersonIds.add(value);
        }
      }
    }
  }

  const userIds = [...relatedUserIds];
  const personIds = [...relatedPersonIds];
  const contextRequests: Array<{ key: string; pathWithQuery: string }> = [];

  if (userIds.length) {
    contextRequests.push(
      {
        key: "profiles",
        pathWithQuery: `profiles?select=id,email,display_name,created_at&id=in.${buildUuidInFilter(userIds)}`
      },
      {
        key: "memberships",
        pathWithQuery: `tree_memberships?select=*&tree_id=eq.${encodeURIComponent(treeId)}&user_id=in.${buildUuidInFilter(userIds)}`
      }
    );
  }

  if (personIds.length) {
    contextRequests.push({
      key: "persons",
      pathWithQuery: `persons?select=id,full_name&id=in.${buildUuidInFilter(personIds)}`
    });
  }

  const batchedContextRows = new Map<string, unknown>();
  if (contextRequests.length) {
    try {
      const contextResults = await fetchSupabaseAdminRestBatchJson<unknown>(
        contextRequests.map((request) => ({
          pathWithQuery: request.pathWithQuery
        }))
      );
      contextRequests.forEach((request, index) => {
        batchedContextRows.set(request.key, contextResults[index]);
      });
    } catch (error) {
      throw toRepositoryReadError(error, "Не удалось загрузить контекст журнала изменений.");
    }
  }

  const profiles = (batchedContextRows.get("profiles") as Profile[] | undefined) || [];
  const memberships = (batchedContextRows.get("memberships") as MembershipRecord[] | undefined) || [];
  const persons = (batchedContextRows.get("persons") as Array<Pick<PersonRecord, "id" | "full_name">> | undefined) || [];

  const profileById = new Map(profiles.map((profile) => [profile.id, profile] as const));
  const membershipByUserId = new Map(memberships.map((membership) => [membership.user_id, membership] as const));
  const usersById = new Map(
    userIds.map((userId) => {
      const profile = profileById.get(userId) || null;
      const membership = membershipByUserId.get(userId) || null;

      return [
        userId,
        {
          name: profile?.display_name || profile?.email || `Пользователь ${userId.slice(0, 8)}`,
          email: profile?.email || null,
          role: membership?.role || null,
          status: membership?.status || null
        }
      ] as const;
    })
  );

  const personNamesById = new Map(persons.map((person) => [person.id, person.full_name] as const));

  return {
    entries: buildAuditEntryViews(entries, { usersById, personNamesById }),
    total,
    page,
    pageSize
  };
}

export async function createPerson(input: {
  treeId: string;
  fullName: string;
  gender?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  birthPlace?: string | null;
  deathPlace?: string | null;
  bio?: string | null;
  isLiving: boolean;
}) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);

  const payload = {
    tree_id: input.treeId,
    full_name: input.fullName,
    gender: input.gender || null,
    birth_date: input.birthDate || null,
    death_date: input.deathDate || null,
    birth_place: input.birthPlace || null,
    death_place: input.deathPlace || null,
    bio: input.bio || null,
    is_living: input.isLiving,
    created_by: userId
  };

  const data = await mutateAdminFirst<PersonRecord>("persons", "POST", payload, "Не удалось создать запись о человеке.");
  if (!data) {
    throw new AppError(400, "Не удалось создать запись о человеке.");
  }

  queueAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "person",
    entityId: data.id,
    action: "person.created",
    beforeJson: null,
    afterJson: data
  });

  return data;
}

export async function updatePerson(
  personId: string,
  input: Partial<{
    fullName: string;
    gender: string | null;
    birthDate: string | null;
    deathDate: string | null;
    birthPlace: string | null;
    deathPlace: string | null;
    bio: string | null;
    isLiving: boolean;
  }>
) {
  const before = await fetchAdminFirst<PersonRecord>(
    `persons?select=*&id=eq.${encodeURIComponent(personId)}`,
    "Не удалось загрузить данные человека."
  );
  if (!before) throw new AppError(404, "Человек не найден.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  const payload = {
    full_name: input.fullName ?? before.full_name,
    gender: input.gender === undefined ? before.gender : input.gender,
    birth_date: input.birthDate === undefined ? before.birth_date : input.birthDate,
    death_date: input.deathDate === undefined ? before.death_date : input.deathDate,
    birth_place: input.birthPlace === undefined ? before.birth_place : input.birthPlace,
    death_place: input.deathPlace === undefined ? before.death_place : input.deathPlace,
    bio: input.bio === undefined ? before.bio : input.bio,
    is_living: input.isLiving === undefined ? before.is_living : input.isLiving
  };

  const data = await mutateAdminFirst<PersonRecord>(
    `persons?id=eq.${encodeURIComponent(personId)}`,
    "PATCH",
    payload,
    "Не удалось обновить данные человека."
  );
  if (!data) throw new AppError(400, "Не удалось обновить данные человека.");

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "person",
    entityId: personId,
    action: "person.updated",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

export async function deletePerson(personId: string) {
  const before = await fetchAdminFirst<PersonRecord>(
    `persons?select=*&id=eq.${encodeURIComponent(personId)}`,
    "Не удалось загрузить данные человека."
  );
  if (!before) throw new AppError(404, "Человек не найден.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  await mutateAdminRows<never>(
    `persons?id=eq.${encodeURIComponent(personId)}`,
    "DELETE",
    undefined,
    "Не удалось удалить запись о человеке."
  );

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "person",
    entityId: personId,
    action: "person.deleted",
    beforeJson: before,
    afterJson: null
  });
}

export async function createParentLink(input: { treeId: string; parentPersonId: string; childPersonId: string; relationType: string }) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);
  const data = await mutateAdminFirst<ParentLinkRecord>(
    "person_parent_links",
    "POST",
    {
      tree_id: input.treeId,
      parent_person_id: input.parentPersonId,
      child_person_id: input.childPersonId,
      relation_type: input.relationType
    },
    "Не удалось создать связь родитель-ребенок."
  );

  if (!data) throw new AppError(400, "Не удалось создать связь родитель-ребенок.");

  queueAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "parent_link",
    entityId: data.id,
    action: "relationship.parent_child_created",
    beforeJson: null,
    afterJson: data
  });

  return data;
}

export async function deleteParentLink(linkId: string) {
  const before = await fetchAdminFirst<ParentLinkRecord>(
    `person_parent_links?select=*&id=eq.${encodeURIComponent(linkId)}`,
    "Не удалось загрузить связь родитель-ребенок."
  );
  if (!before) throw new AppError(404, "Связь не найдена.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  await mutateAdminRows<never>(
    `person_parent_links?id=eq.${encodeURIComponent(linkId)}`,
    "DELETE",
    undefined,
    "Не удалось удалить связь родитель-ребенок."
  );

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "parent_link",
    entityId: linkId,
    action: "relationship.parent_child_deleted",
    beforeJson: before,
    afterJson: null
  });
}

export async function createPartnership(input: { treeId: string; personAId: string; personBId: string; status: string; startDate?: string | null; endDate?: string | null }) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);
  const data = await mutateAdminFirst<PartnershipRecord>(
    "person_partnerships",
    "POST",
    {
      tree_id: input.treeId,
      person_a_id: input.personAId,
      person_b_id: input.personBId,
      status: input.status,
      start_date: input.startDate || null,
      end_date: input.endDate || null
    },
    "Не удалось создать пару."
  );

  if (!data) throw new AppError(400, "Не удалось создать пару.");

  queueAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "partnership",
    entityId: data.id,
    action: "relationship.partnership_created",
    beforeJson: null,
    afterJson: data
  });

  return data;
}

export async function updatePartnership(partnershipId: string, input: Partial<{ status: string; startDate: string | null; endDate: string | null }>) {
  const before = await fetchAdminFirst<PartnershipRecord>(
    `person_partnerships?select=*&id=eq.${encodeURIComponent(partnershipId)}`,
    "Не удалось загрузить данные пары."
  );
  if (!before) throw new AppError(404, "Пара не найдена.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);

  const data = await mutateAdminFirst<PartnershipRecord>(
    `person_partnerships?id=eq.${encodeURIComponent(partnershipId)}`,
    "PATCH",
    {
      status: input.status ?? before.status,
      start_date: input.startDate === undefined ? before.start_date : input.startDate,
      end_date: input.endDate === undefined ? before.end_date : input.endDate
    },
    "Не удалось обновить данные пары."
  );

  if (!data) throw new AppError(400, "Не удалось обновить данные пары.");

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "partnership",
    entityId: partnershipId,
    action: "relationship.partnership_updated",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

export async function deletePartnership(partnershipId: string) {
  const before = await fetchAdminFirst<PartnershipRecord>(
    `person_partnerships?select=*&id=eq.${encodeURIComponent(partnershipId)}`,
    "Не удалось загрузить данные пары."
  );
  if (!before) throw new AppError(404, "Пара не найдена.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  await mutateAdminRows<never>(
    `person_partnerships?id=eq.${encodeURIComponent(partnershipId)}`,
    "DELETE",
    undefined,
    "Не удалось удалить пару."
  );

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "partnership",
    entityId: partnershipId,
    action: "relationship.partnership_deleted",
    beforeJson: before,
    afterJson: null
  });
}

export async function createInvite(input: { treeId: string; role: UserRole; inviteMethod: "link" | "email"; email?: string | null; expiresInDays: number }) {
  const { userId, membership } = await requireTreeRole(input.treeId, ["owner", "admin"]);

  if (membership.role === "admin" && input.role === "owner") {
    throw new AppError(403, "Администратор не может приглашать владельцев.");
  }

  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const data = await mutateAdminFirst<InviteRecord>(
    "tree_invites",
    "POST",
    {
      tree_id: input.treeId,
      email: input.email || null,
      role: input.role,
      invite_method: input.inviteMethod,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: userId
    },
    "Не удалось создать приглашение."
  );

  if (!data) throw new AppError(400, "Не удалось создать приглашение.");

  queueAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "invite",
    entityId: data.id,
    action: "invite.created",
    beforeJson: null,
    afterJson: data
  });

  const treeTitle = (await getTreeById(input.treeId)).title;
  const inviteUrl = `${getBaseUrl()}/auth/accept-invite?token=${token}`;
  const delivery = await sendInviteEmailIfConfigured({
    inviteMethod: input.inviteMethod,
    email: input.email || null,
    inviteUrl,
    treeTitle,
    role: input.role,
    expiresAt,
  });

  return {
    invite: data,
    token,
    url: inviteUrl,
    ...delivery
  };
}

interface InviteWithTreeSlugRecord extends InviteRecord {
  tree?: Pick<TreeRecord, "id" | "slug" | "owner_user_id"> | null;
}

export async function acceptInvite(token: string) {
  const userId = await getAuthenticatedUserId();
  const tokenHash = hashInviteToken(token);

  const invite = await fetchAdminFirst<InviteWithTreeSlugRecord>(
    `tree_invites?select=*,tree:trees!inner(id,slug,owner_user_id)&token_hash=eq.${encodeURIComponent(tokenHash)}`,
    "Не удалось загрузить приглашение."
  );
  if (!invite) throw new AppError(404, "Приглашение не найдено.");
  if (invite.accepted_at) throw new AppError(409, "Это приглашение уже использовано.");
  if (new Date(invite.expires_at).getTime() < Date.now()) throw new AppError(410, "Срок действия приглашения истек.");
  const treeSlug = invite.tree?.slug || null;
  const { tree: _inviteTree, ...inviteRecord } = invite;
  const currentMembership = await getMembership(inviteRecord.tree_id, userId).catch((error) => {
    throw toRepositoryReadError(error, "Не удалось проверить текущее членство перед принятием приглашения.");
  });
  const currentRole = resolveTreeRole({
    userId,
    treeOwnerUserId: invite.tree?.owner_user_id ?? null,
    membershipRole: currentMembership?.role ?? null
  });
  const acceptedRole = mergeInviteAcceptanceRole(currentRole, inviteRecord.role);

  const acceptedAt = new Date().toISOString();
  const [membershipResult, updatedInvite] = await Promise.all([
    fetchSupabaseAdminRestJsonWithHeaders<MembershipRecord[] | MembershipRecord | null>(
      "tree_memberships?on_conflict=tree_id,user_id",
      {
        method: "POST",
        body: {
          tree_id: inviteRecord.tree_id,
          user_id: userId,
          role: acceptedRole,
          status: "active"
        },
        headers: {
          prefer: "resolution=merge-duplicates,return=representation"
        }
      }
    )
      .then(({ data }) => {
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        return rows[0] ?? null;
      })
      .catch((error) => {
        throw toRepositoryReadError(error, "Не удалось сохранить членство.");
      }),
    mutateAdminFirst<InviteRecord>(
      `tree_invites?id=eq.${encodeURIComponent(inviteRecord.id)}&select=*`,
      "PATCH",
      { accepted_at: acceptedAt },
      "Не удалось отметить приглашение принятым."
    )
  ]);

  if (!membershipResult) {
    throw new AppError(400, "Не удалось сохранить членство.");
  }
  if (!updatedInvite) {
    throw new AppError(500, "Не удалось отметить приглашение принятым.");
  }

  queueAuditLog({
    treeId: inviteRecord.tree_id,
    actorUserId: userId,
    entityType: "invite",
    entityId: inviteRecord.id,
    action: "invite.accepted",
    beforeJson: inviteRecord,
    afterJson: { ...inviteRecord, accepted_at: acceptedAt }
  });

  return {
    slug: treeSlug || (await getTreeById(inviteRecord.tree_id)).slug
  };
}

export async function revokeInvite(inviteId: string) {
  const [before, user] = await Promise.all([
    fetchAdminFirst<InviteRecord>(
      `tree_invites?select=*&id=eq.${encodeURIComponent(inviteId)}`,
      "Не удалось загрузить приглашение."
    ),
    getCurrentUser()
  ]);
  if (!user) {
    throw new AppError(401, "Требуется авторизация.");
  }
  if (!before) {
    throw new AppError(404, "Приглашение не найдено.");
  }

  if (before.accepted_at) {
    throw new AppError(409, "Принятое приглашение нельзя отозвать.");
  }

  const membership = await getMembership(before.tree_id, user.id);
  if (!membership || !hasRequiredRole(membership.role, ["owner", "admin"])) {
    throw new AppError(403, "У вас нет доступа к этому действию в дереве.");
  }
  const userId = user.id;
  await mutateAdminRows<never>(
    `tree_invites?id=eq.${encodeURIComponent(inviteId)}`,
    "DELETE",
    undefined,
    "Не удалось отозвать приглашение."
  );

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "invite",
    entityId: inviteId,
    action: "invite.revoked",
    beforeJson: before,
    afterJson: null
  });
}

export async function updateMembershipRole(membershipId: string, role: UserRole) {
  const { data: before, error: beforeError } = await admin().from("tree_memberships").select("*").eq("id", membershipId).single<MembershipRecord>();
  if (beforeError || !before) throw new AppError(404, "Участник не найден.");

  const tree = await getTreeById(before.tree_id);
  const { userId, membership } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  if (membership.role === "admin" && role === "owner") {
    throw new AppError(403, "Администратор не может назначить владельца.");
  }
  if (resolveTreeRole({ userId: before.user_id, treeOwnerUserId: tree.owner_user_id, membershipRole: before.role }) === "owner") {
    throw new AppError(403, "В версии v1 роль владельца нельзя переназначить.");
  }

  const { data, error } = await admin().from("tree_memberships").update({ role }).eq("id", membershipId).select("*").single<MembershipRecord>();
  if (error || !data) throw new AppError(400, error?.message || "Не удалось изменить роль участника.");

  await insertAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "membership",
    entityId: membershipId,
    action: "membership.role_updated",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

export async function revokeMembership(membershipId: string) {
  const { data: before, error: beforeError } = await admin().from("tree_memberships").select("*").eq("id", membershipId).single<MembershipRecord>();
  if (beforeError || !before) throw new AppError(404, "Участник не найден.");

  const tree = await getTreeById(before.tree_id);
  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  if (resolveTreeRole({ userId: before.user_id, treeOwnerUserId: tree.owner_user_id, membershipRole: before.role }) === "owner") {
    throw new AppError(403, "В версии v1 нельзя отозвать доступ владельца.");
  }

  const { error } = await admin().from("tree_memberships").update({ status: "revoked" }).eq("id", membershipId);
  if (error) throw new AppError(400, error.message);

  await insertAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "membership",
    entityId: membershipId,
    action: "membership.revoked",
    beforeJson: before,
    afterJson: { ...before, status: "revoked" }
  });
}

export async function createPhotoUploadTarget(input: {
  treeId: string;
  personId: string;
  filename: string;
  mimeType: string;
  visibility: "public" | "members";
  title: string;
  caption?: string | null;
}) {
  return createMediaUploadTarget(input);
}

async function buildMediaUploadTarget(input: {
  treeId: string;
  filename: string;
  mimeType: string;
  visibility: "public" | "members";
  title: string;
  caption?: string | null;
}): Promise<MediaUploadTargetResponse> {
  const mediaId = crypto.randomUUID();
  const kind = resolveMediaKindFromMimeType(input.mimeType);
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  const storagePath = `trees/${input.treeId}/media/${kind}/${mediaId}/${safeName}`;
  const uploadTarget = await createSignedUploadTargetForPath(storagePath, input.mimeType);
  const variantTargets =
    kind === "photo"
      ? await Promise.all(
          PHOTO_VARIANT_NAMES.map(async (variant) => {
            const variantPath = buildPhotoVariantStoragePath(storagePath, variant);
            const variantUploadTarget = await createSignedUploadTargetForPath(variantPath, "image/webp");
            return {
              variant,
              path: variantPath,
              signedUrl: variantUploadTarget.signedUrl,
              token: variantUploadTarget.token,
              uploadProvider: variantUploadTarget.uploadProvider
            };
          })
        )
      : [];
  const transport = resolveMediaUploadPlan({
    useCloudflareForNewMedia: shouldUseCloudflareR2ForNewMedia(),
    hasVariants: variantTargets.length > 0,
  });

  return {
    mediaId,
    kind,
    path: storagePath,
    bucket: uploadTarget.bucket,
    signedUrl: uploadTarget.signedUrl,
    token: uploadTarget.token,
    uploadProvider: uploadTarget.uploadProvider,
    configuredBackend: transport.configuredBackend,
    resolvedUploadBackend: transport.resolvedUploadBackend,
    rolloutState: transport.rolloutState,
    forceProxyUpload: transport.forceProxyUpload,
    uploadMode: transport.uploadMode,
    variantUploadMode: transport.variantUploadMode,
    variantTargets
  };
}

export async function createMediaUploadTarget(input: {
  treeId: string;
  personId: string;
  filename: string;
  mimeType: string;
  visibility: "public" | "members";
  title: string;
  caption?: string | null;
}): Promise<MediaUploadTargetResponse> {
  await requireTreeRole(input.treeId, ["owner", "admin"]);
  return buildMediaUploadTarget(input);
}

export async function createArchiveMediaUploadTarget(input: {
  treeId: string;
  filename: string;
  mimeType: string;
  visibility: "public" | "members";
  title: string;
  caption?: string | null;
}): Promise<MediaUploadTargetResponse> {
  await requireTreeRole(input.treeId, ["owner", "admin"]);
  return buildMediaUploadTarget(input);
}

export async function completePhotoUpload(input: {
  treeId: string;
  personId: string;
  mediaId: string;
  storagePath: string;
  variantPaths?: Array<{
    variant: MediaVariantName;
    storagePath: string;
  }>;
  title: string;
  caption?: string | null;
  visibility: "public" | "members";
  mimeType: string;
  sizeBytes?: number | null;
}) {
  return completeMediaUpload(input);
}

type CompletedStoredMediaInput = {
  treeId: string;
  personId: string;
  mediaId: string;
  storagePath: string;
  variantPaths?: Array<{
    variant: MediaVariantName;
    storagePath: string;
  }>;
  title: string;
  caption?: string | null;
  visibility: "public" | "members";
  mimeType: string;
  sizeBytes?: number | null;
  provider?: "supabase_storage" | "object_storage";
};

type CompletedExternalVideoInput = {
  treeId: string;
  personId: string;
  mediaId: string;
  title: string;
  caption?: string | null;
  visibility: "public" | "members";
  provider: "yandex_disk";
  externalUrl: string;
};

function isExternalVideoCompletionInput(
  input: CompletedStoredMediaInput | CompletedExternalVideoInput
): input is CompletedExternalVideoInput {
  return input.provider === "yandex_disk";
}

type CompletedStoredArchiveMediaInput = {
  treeId: string;
  mediaId: string;
  albumId?: string;
  storagePath: string;
  variantPaths?: Array<{
    variant: MediaVariantName;
    storagePath: string;
  }>;
  title: string;
  caption?: string | null;
  visibility: "public" | "members";
  mimeType: string;
  sizeBytes?: number | null;
  provider?: "supabase_storage" | "object_storage";
};

type CompletedExternalArchiveVideoInput = {
  treeId: string;
  mediaId: string;
  albumId?: string;
  title: string;
  caption?: string | null;
  visibility: "public" | "members";
  provider: "yandex_disk";
  externalUrl: string;
};

function isExternalArchiveVideoCompletionInput(
  input: CompletedStoredArchiveMediaInput | CompletedExternalArchiveVideoInput
): input is CompletedExternalArchiveVideoInput {
  return input.provider === "yandex_disk";
}

export async function completeMediaUpload(input: {
  treeId: string;
  personId: string;
  mediaId: string;
  storagePath: string;
  variantPaths?: Array<{
    variant: MediaVariantName;
    storagePath: string;
  }>;
  title: string;
  caption?: string | null;
  visibility: "public" | "members";
  mimeType: string;
  sizeBytes?: number | null;
  provider?: "supabase_storage" | "object_storage";
} | {
  treeId: string;
  personId: string;
  mediaId: string;
  title: string;
  caption?: string | null;
  visibility: "public" | "members";
  provider: "yandex_disk";
  externalUrl: string;
}) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);
  const kind = isExternalVideoCompletionInput(input) ? "video" : resolveMediaKindFromMimeType(input.mimeType);
  const provider = isExternalVideoCompletionInput(input) ? "yandex_disk" : getFileBackedMediaProvider();
  const storagePath = isExternalVideoCompletionInput(input) ? null : input.storagePath;
  const variantPaths = isExternalVideoCompletionInput(input) ? [] : input.variantPaths || [];
  const externalUrl = isExternalVideoCompletionInput(input) ? input.externalUrl : null;
  const mimeType = isExternalVideoCompletionInput(input) ? null : input.mimeType;
  const sizeBytes = isExternalVideoCompletionInput(input) ? null : input.sizeBytes || null;

  const data = await mutateAdminFirst<MediaAssetRecord>(
    "media_assets",
    "POST",
    {
      id: input.mediaId,
      tree_id: input.treeId,
      kind,
      provider,
      visibility: input.visibility,
      storage_path: storagePath,
      external_url: externalUrl,
      title: input.title,
      caption: input.caption || null,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      created_by: userId
    },
    "Не удалось завершить загрузку файла."
  );

  if (!data) {
    throw new AppError(400, "Не удалось завершить загрузку файла.");
  }

  if (variantPaths.length) {
    try {
      await mutateAdminRows<MediaAssetVariantRecord>(
        "media_asset_variants",
        "POST",
        variantPaths.map((item) => ({
          media_id: input.mediaId,
          variant: item.variant,
          storage_path: item.storagePath
        })),
        "Не удалось сохранить варианты медиа."
      );
    } catch (error) {
      if (!isMediaVariantsSchemaUnavailableError(error)) {
        await mutateAdminRows<never>(
          `media_assets?id=eq.${encodeURIComponent(input.mediaId)}`,
          "DELETE",
          undefined,
          "Не удалось откатить незавершенное медиа."
        ).catch(() => {});
        throw toRepositoryReadError(error, "Не удалось сохранить варианты медиа.");
      }
    }
  }

  try {
    await mutateAdminRows<never>(
      "person_media",
      "POST",
      {
        person_id: input.personId,
        media_id: input.mediaId,
        is_primary: false
      },
      "Не удалось привязать медиа к человеку."
    );
  } catch (error) {
    throw toRepositoryReadError(error, "Не удалось привязать медиа к человеку.");
  }

  await insertAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "media",
    entityId: input.mediaId,
    action: `${kind}.created`,
    beforeJson: null,
    afterJson: data
  });

  return data;
}

export async function completeArchiveMediaUpload(input: CompletedStoredArchiveMediaInput | CompletedExternalArchiveVideoInput) {
  const user = await getCurrentUser();
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);
  const kind = isExternalArchiveVideoCompletionInput(input) ? "video" : resolveMediaKindFromMimeType(input.mimeType);
  const provider = isExternalArchiveVideoCompletionInput(input) ? "yandex_disk" : getFileBackedMediaProvider();
  const storagePath = isExternalArchiveVideoCompletionInput(input) ? null : input.storagePath;
  const variantPaths = isExternalArchiveVideoCompletionInput(input) ? [] : input.variantPaths || [];
  const externalUrl = isExternalArchiveVideoCompletionInput(input) ? input.externalUrl : null;
  const mimeType = isExternalArchiveVideoCompletionInput(input) ? null : input.mimeType;
  const sizeBytes = isExternalArchiveVideoCompletionInput(input) ? null : input.sizeBytes || null;

  const data = await mutateAdminFirst<MediaAssetRecord>(
    "media_assets",
    "POST",
    {
      id: input.mediaId,
      tree_id: input.treeId,
      kind,
      provider,
      visibility: input.visibility,
      storage_path: storagePath,
      external_url: externalUrl,
      title: input.title,
      caption: input.caption || null,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      created_by: userId
    },
    "Не удалось сохранить файл в семейный архив."
  );

  if (!data) {
    throw new AppError(400, "Не удалось сохранить файл в семейный архив.");
  }

  if (variantPaths.length) {
    try {
      await mutateAdminRows<MediaAssetVariantRecord>(
        "media_asset_variants",
        "POST",
        variantPaths.map((item: { variant: MediaVariantName; storagePath: string }) => ({
          media_id: input.mediaId,
          variant: item.variant,
          storage_path: item.storagePath
        })),
        "Не удалось сохранить варианты медиа."
      );
    } catch (error) {
      if (!isMediaVariantsSchemaUnavailableError(error)) {
        await mutateAdminRows<never>(
          `media_assets?id=eq.${encodeURIComponent(input.mediaId)}`,
          "DELETE",
          undefined,
          "Не удалось откатить незавершенное медиа."
        ).catch(() => {});
        throw toRepositoryReadError(error, "Не удалось сохранить варианты медиа.");
      }
    }
  }

  const uploaderAlbum = await ensureUploaderTreeMediaAlbum(input.treeId, userId, user?.email || null);
  const albumIds = [uploaderAlbum.id];
  if ("albumId" in input && input.albumId && input.albumId !== uploaderAlbum.id) {
    albumIds.push(input.albumId);
  }

  try {
    await addMediaToTreeMediaAlbums(albumIds, input.mediaId);
  } catch (error) {
    throw toRepositoryReadError(error, "Не удалось добавить материал в семейный архив.");
  }

  await insertAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "media",
    entityId: input.mediaId,
    action: `${kind}.created`,
    beforeJson: null,
    afterJson: data
  });

  return {
    media: data,
    uploaderAlbumId: uploaderAlbum.id
  };
}

export async function setPrimaryPersonMedia(mediaId: string, personId: string) {
  const relation = await fetchAdminFirst<PersonMediaRecord>(
    `person_media?select=*&person_id=eq.${encodeURIComponent(personId)}&media_id=eq.${encodeURIComponent(mediaId)}`,
    "Не удалось загрузить связь человека с медиа."
  );
  if (!relation) {
    throw new AppError(404, "Связь человека с фото не найдена.");
  }

  const media = await fetchAdminFirst<MediaAssetRecord>(
    `media_assets?select=*&id=eq.${encodeURIComponent(mediaId)}`,
    "Не удалось загрузить медиа."
  );
  if (!media) {
    throw new AppError(404, "Медиа не найдено.");
  }
  if (media.kind !== "photo") {
    throw new AppError(400, "Аватаром можно сделать только фотографию.");
  }

  const { userId } = await requireTreeRole(media.tree_id, ["owner", "admin"]);
  const previousPrimary = await fetchAdminFirst<PersonMediaRecord>(
    `person_media?select=*&person_id=eq.${encodeURIComponent(personId)}&is_primary=eq.true`,
    "Не удалось загрузить текущий аватар."
  );

  if (relation.is_primary) {
    return relation;
  }

  await mutateAdminRows<never>(
    `person_media?person_id=eq.${encodeURIComponent(personId)}&is_primary=eq.true`,
    "PATCH",
    { is_primary: false },
    "Не удалось снять текущий аватар."
  );

  const updatedRelation = await mutateAdminFirst<PersonMediaRecord>(
    `person_media?person_id=eq.${encodeURIComponent(personId)}&media_id=eq.${encodeURIComponent(mediaId)}&select=*`,
    "PATCH",
    { is_primary: true },
    "Не удалось назначить фотографию аватаром."
  );

  if (!updatedRelation) {
    throw new AppError(400, "Не удалось назначить фотографию аватаром.");
  }

  queueAuditLog({
    treeId: media.tree_id,
    actorUserId: userId,
    entityType: "person_media",
    entityId: relation.id,
    action: "person.avatar_selected",
    beforeJson: previousPrimary
      ? {
          person_id: previousPrimary.person_id,
          media_id: previousPrimary.media_id,
          is_primary: previousPrimary.is_primary
        }
      : null,
    afterJson: {
      person_id: updatedRelation.person_id,
      media_id: updatedRelation.media_id,
      is_primary: updatedRelation.is_primary
    }
  });

  return updatedRelation;
}

export async function resolveMediaAccess(mediaId: string, shareToken?: string | null, variant?: MediaVariantName | null) {
  const media = await fetchAdminFirst<MediaAssetRecord>(
    `media_assets?select=*&id=eq.${encodeURIComponent(mediaId)}`,
    "Не удалось загрузить медиа."
  );
  if (!media) throw new AppError(404, "Медиа не найдено.");

  const tree = await getTreeById(media.tree_id);
  const readAccess = await getTreeReadAccess(tree, shareToken);

  if (!canSeeMedia(readAccess.actor.role, media.visibility, readAccess.hasShareLinkAccess)) {
    throw new AppError(403, "У вас нет доступа к этому медиафайлу.");
  }

  if (media.external_url) {
    return { kind: "video" as const, url: media.external_url || "" };
  }

  if (!media.storage_path) {
    throw new AppError(404, "Файл медиа отсутствует.");
  }

  let resolvedVariantPath: string | null = null;
  if (variant && media.kind === "photo" && shouldUsePhotoVariants(media.created_at)) {
    try {
      const mediaVariant = await fetchAdminFirst<MediaAssetVariantRecord>(
        `media_asset_variants?select=*&media_id=eq.${encodeURIComponent(mediaId)}&variant=eq.${encodeURIComponent(variant)}`,
        "Не удалось загрузить вариант медиа."
      );
      if (mediaVariant?.storage_path) {
        resolvedVariantPath = mediaVariant.storage_path;
      }
    } catch (error) {
      if (!isMediaVariantsSchemaUnavailableError(error)) {
        throw error;
      }
    }

    if (!resolvedVariantPath) {
      resolvedVariantPath = buildPhotoVariantStoragePath(media.storage_path, variant);
    }
  }

  if (media.provider === "object_storage") {
    const storageEnv = getObjectStorageEnvForMedia(media.created_at);
    const resolvedStoragePath = resolvedVariantPath || media.storage_path;
    const signedUrl = await createObjectStorageSignedReadUrl(resolvedStoragePath, storageEnv);
    return { kind: media.kind, url: signedUrl };
  }

  if (resolvedVariantPath) {
    const { data: variantSigned, error: variantSignedError } = await admin().storage.from(getStorageBucket()).createSignedUrl(resolvedVariantPath, 60);
    if (!variantSignedError && variantSigned) {
      return { kind: media.kind, url: variantSigned.signedUrl };
    }
  }

  const { data: signed, error: signedError } = await admin().storage.from(getStorageBucket()).createSignedUrl(media.storage_path, 60);
  if (signedError || !signed) throw new AppError(400, signedError?.message || "Не удалось создать подписанную ссылку.");

  return { kind: media.kind, url: signed.signedUrl };
}

export async function deleteMedia(mediaId: string) {
  const before = await fetchAdminFirst<MediaAssetRecord>(
    `media_assets?select=*&id=eq.${encodeURIComponent(mediaId)}`,
    "Не удалось загрузить медиа."
  );
  if (!before) throw new AppError(404, "Медиа не найдено.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  let variants: MediaAssetVariantRecord[] = [];
  try {
    variants = await fetchAdminRows<MediaAssetVariantRecord>(
      `media_asset_variants?select=*&media_id=eq.${encodeURIComponent(mediaId)}`,
      "Не удалось загрузить варианты медиа."
    );
  } catch (error) {
    if (!isMediaVariantsSchemaUnavailableError(error)) {
      throw error;
    }
  }
  const variantStoragePaths = variants.length
    ? variants.map((item) => item.storage_path)
    : before.kind === "photo" && before.storage_path && shouldUsePhotoVariants(before.created_at)
      ? PHOTO_VARIANT_NAMES.map((variant) => buildPhotoVariantStoragePath(before.storage_path as string, variant))
      : [];

  if (before.storage_path) {
    if (before.provider === "object_storage") {
      const storageEnv = getObjectStorageEnvForMedia(before.created_at);
      try {
        await deleteObjectStorageObject(before.storage_path, storageEnv);
        for (const variantStoragePath of variantStoragePaths) {
          await deleteObjectStorageObject(variantStoragePath, storageEnv).catch(() => {});
        }
      } catch (error) {
        throw toObjectStorageError(error, "Не удалось удалить файл из object storage.");
      }
    } else {
      await admin().storage.from(getStorageBucket()).remove([before.storage_path]);
      if (variantStoragePaths.length) {
        await admin().storage.from(getStorageBucket()).remove(variantStoragePaths);
      }
    }
  }

  await mutateAdminRows<never>(
    `media_assets?id=eq.${encodeURIComponent(mediaId)}`,
    "DELETE",
    undefined,
    "Не удалось удалить медиа."
  );

  await insertAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "media",
    entityId: mediaId,
    action: `${before.kind}.deleted`,
    beforeJson: before,
    afterJson: null
  });
}

export async function getDashboardBootstrap() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError(401, "Требуется авторизация.");
  }

  const trees = await listUserTrees(user.id);
  return { user, trees };
}

