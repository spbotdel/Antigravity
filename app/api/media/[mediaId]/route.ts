import { hashOpaqueToken } from "@/lib/server/invite-token";
import { getCurrentUser } from "@/lib/server/auth";
import { NextResponse } from "next/server";

import { AppError, toErrorResponse } from "@/lib/server/errors";
import type { MediaVisibility, ViewerAccessSource } from "@/lib/types";
import { buildAttachmentContentDisposition, buildMediaDownloadFilename, deleteMedia, getMediaSummary, resolveMediaAccess, setPrimaryPersonMedia } from "@/lib/server/repository";
import { setPrimaryPersonMediaSchema } from "@/lib/validators/media";

interface Params {
  params: Promise<{ mediaId: string }>;
}

interface ThumbMediaScopeCacheEntry {
  treeId: string;
  effectiveVisibility: MediaVisibility;
  expiresAt: number;
}

interface ThumbRedirectCacheEntry {
  url: string;
  treeId: string;
  effectiveVisibility: MediaVisibility;
  accessSource: ViewerAccessSource;
  expiresAt: number;
}

const MEDIA_THUMB_ROUTE_CACHE_TTL_MS = 30_000;
const MAX_PDF_PROXY_BYTES = 100 * 1024 * 1024;
const thumbRedirectCache = new Map<string, ThumbRedirectCacheEntry>();
const thumbRedirectInFlight = new Map<string, Promise<ThumbRedirectCacheEntry>>();
const thumbMediaScopeCache = new Map<string, ThumbMediaScopeCacheEntry>();

function getCacheEntryIfFresh<T extends { expiresAt: number }>(store: Map<string, T>, key: string) {
  const entry = store.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return entry;
}

function setThumbRedirectCacheEntry(key: string, entry: ThumbRedirectCacheEntry) {
  thumbRedirectCache.set(key, entry);
}

function setThumbMediaScopeCacheEntry(mediaId: string, entry: ThumbMediaScopeCacheEntry) {
  thumbMediaScopeCache.set(mediaId, entry);
}

function buildThumbActorScope(userId: string | null, shareToken?: string | null) {
  const shareScope = shareToken ? hashOpaqueToken(shareToken) : "none";
  return `user:${userId || "anonymous"}|share:${shareScope}`;
}

function buildThumbCacheKey(input: {
  mediaId: string;
  variant: "thumb";
  actorScope: string;
  treeId: string;
  effectiveVisibility: MediaVisibility | "pending";
}) {
  return [
    "thumb-redirect",
    `media:${input.mediaId}`,
    `variant:${input.variant}`,
    `tree:${input.treeId}`,
    `visibility:${input.effectiveVisibility}`,
    `actor:${input.actorScope}`
  ].join("|");
}

async function getCachedThumbRedirectTarget(input: {
  mediaId: string;
  shareToken?: string | null;
}) {
  const resolvedUser = await getCurrentUser();
  const actorScope = buildThumbActorScope(resolvedUser?.id ?? null, input.shareToken);
  const cachedMediaScope = getCacheEntryIfFresh(thumbMediaScopeCache, input.mediaId);
  const activeCacheKey = buildThumbCacheKey({
    mediaId: input.mediaId,
    variant: "thumb",
    actorScope,
    treeId: cachedMediaScope?.treeId || "pending",
    effectiveVisibility: cachedMediaScope?.effectiveVisibility || "pending"
  });
  const cachedEntry = getCacheEntryIfFresh(thumbRedirectCache, activeCacheKey);
  if (cachedEntry) {
    return cachedEntry;
  }

  const inFlight = thumbRedirectInFlight.get(activeCacheKey);
  if (inFlight) {
    return inFlight;
  }

  const pendingEntry = (async () => {
    const resolvedAccess = await resolveMediaAccess(input.mediaId, input.shareToken, "thumb", {
      download: false,
      resolvedUser
    });
    const cacheContext = resolvedAccess.cacheContext;
    if (!cacheContext) {
      throw new Error("Thumb cache context is required for media thumb redirects.");
    }

    const nextEntry: ThumbRedirectCacheEntry = {
      url: resolvedAccess.url,
      treeId: cacheContext.treeId,
      effectiveVisibility: cacheContext.effectiveVisibility,
      accessSource: cacheContext.accessSource,
      expiresAt: Date.now() + MEDIA_THUMB_ROUTE_CACHE_TTL_MS
    };

    setThumbMediaScopeCacheEntry(input.mediaId, {
      treeId: cacheContext.treeId,
      effectiveVisibility: cacheContext.effectiveVisibility,
      expiresAt: nextEntry.expiresAt
    });

    const scopedCacheKey = buildThumbCacheKey({
      mediaId: input.mediaId,
      variant: "thumb",
      actorScope,
      treeId: cacheContext.treeId,
      effectiveVisibility: cacheContext.effectiveVisibility
    });
    setThumbRedirectCacheEntry(scopedCacheKey, nextEntry);
    if (scopedCacheKey !== activeCacheKey) {
      setThumbRedirectCacheEntry(activeCacheKey, nextEntry);
    }

    return nextEntry;
  })();

  thumbRedirectInFlight.set(activeCacheKey, pendingEntry);

  try {
    return await pendingEntry;
  } finally {
    thumbRedirectInFlight.delete(activeCacheKey);
  }
}

function isPdfDocumentMimeType(mimeType: string | null | undefined) {
  const normalizedMimeType = mimeType?.trim().toLowerCase() || "";
  return normalizedMimeType === "application/pdf" || normalizedMimeType.endsWith("/pdf");
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const shareToken = searchParams.get("share");
    const download = searchParams.get("download") === "1";
    const summary = searchParams.get("summary") === "1";
    const rawVariant = searchParams.get("variant");
    const variant = !download && (rawVariant === "thumb" || rawVariant === "small" || rawVariant === "medium") ? rawVariant : null;
    if (summary) {
      const media = await getMediaSummary(mediaId, shareToken);
      return Response.json({ media });
    }
    if (variant === "thumb") {
      const cachedThumbRedirect = await getCachedThumbRedirectTarget({ mediaId, shareToken });
      return NextResponse.redirect(cachedThumbRedirect.url);
    }
    if (download) {
      const media = await getMediaSummary(mediaId, shareToken);
      if (media.kind === "document" && isPdfDocumentMimeType(media.mime_type)) {
        const result = await resolveMediaAccess(mediaId, shareToken, null, { download: true });
        const upstreamResponse = await fetch(result.url);
        if (!upstreamResponse.ok || !upstreamResponse.body) {
          throw new Error("Не удалось подготовить PDF для скачивания.");
        }

        const contentLength = upstreamResponse.headers.get("content-length");
        const parsedContentLength = contentLength ? Number(contentLength) : Number.NaN;
        if (Number.isFinite(parsedContentLength) && parsedContentLength > MAX_PDF_PROXY_BYTES) {
          throw new AppError(413, "PDF слишком большой для скачивания через сервер.");
        }

        const responseHeaders = new Headers();
        responseHeaders.set("Content-Type", "application/octet-stream");
        responseHeaders.set("Content-Disposition", buildAttachmentContentDisposition(buildMediaDownloadFilename(media)));
        responseHeaders.set("Cache-Control", "no-store");
        responseHeaders.set("X-Content-Type-Options", "nosniff");

        if (contentLength) {
          responseHeaders.set("Content-Length", contentLength);
        }

        return new Response(upstreamResponse.body, {
          status: 200,
          headers: responseHeaders,
        });
      }
    }
    const result = await resolveMediaAccess(mediaId, shareToken, variant, { download });
    return NextResponse.redirect(result.url);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    await deleteMedia(mediaId);
    return Response.json({ message: "Медиа удалено." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    const payload = setPrimaryPersonMediaSchema.parse(await request.json());
    const relation = await setPrimaryPersonMedia(mediaId, payload.personId, payload.avatarCrop);
    return Response.json({ relation, message: "Аватар обновлен." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

