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
const CHROME_ANDROID_INITIAL_VIDEO_RANGE_BYTES = 2 * 1024 * 1024;
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

async function proxyPdfDocumentResponse(input: {
  mediaId: string;
  shareToken?: string | null;
  media: Awaited<ReturnType<typeof getMediaSummary>>;
  download: boolean;
}) {
  const result = await resolveMediaAccess(input.mediaId, input.shareToken, null, { download: input.download });
  const upstreamResponse = await fetch(result.url);
  if (!upstreamResponse.ok || !upstreamResponse.body) {
    throw new Error(input.download ? "Не удалось подготовить PDF для скачивания." : "Не удалось подготовить PDF для просмотра.");
  }

  const contentLength = upstreamResponse.headers.get("content-length");
  const parsedContentLength = contentLength ? Number(contentLength) : Number.NaN;
  if (Number.isFinite(parsedContentLength) && parsedContentLength > MAX_PDF_PROXY_BYTES) {
    throw new AppError(413, input.download ? "PDF слишком большой для скачивания через сервер." : "PDF слишком большой для просмотра через сервер.");
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", input.download ? "application/octet-stream" : "application/pdf");
  responseHeaders.set(
    "Content-Disposition",
    input.download ? buildAttachmentContentDisposition(buildMediaDownloadFilename(input.media)) : "inline"
  );
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

function classifyVideoClient(request: Request) {
  const userAgent = request.headers.get("user-agent") || "";
  const secChUa = request.headers.get("sec-ch-ua") || "";
  const isAndroid = /android/i.test(userAgent);
  const isOpera = /opr\//i.test(userAgent) || /opera/i.test(secChUa);
  const isChrome = /chrome\//i.test(userAgent) || /chromium/i.test(secChUa);

  if (isAndroid && isOpera) {
    return "opera-android";
  }

  if (isAndroid && isChrome) {
    return "chrome-android";
  }

  if (isOpera) {
    return "opera-other";
  }

  if (isChrome) {
    return "chrome-other";
  }

  return "unknown";
}

function shouldProxyOriginalVideo(media: Awaited<ReturnType<typeof getMediaSummary>>, variant: string | null, download: boolean) {
  return media.kind === "video" && !variant && !download && !media.external_url && Boolean(media.storage_path);
}

function buildForcedInitialChromeAndroidRange(
  request: Request,
  media: Awaited<ReturnType<typeof getMediaSummary>>
) {
  if (request.headers.get("range")) {
    return null;
  }

  if (classifyVideoClient(request) !== "chrome-android") {
    return null;
  }

  const maxEndByte = CHROME_ANDROID_INITIAL_VIDEO_RANGE_BYTES - 1;
  const boundedEndByte =
    typeof media.size_bytes === "number" && media.size_bytes > 0
      ? Math.max(0, Math.min(media.size_bytes - 1, maxEndByte))
      : maxEndByte;

  return `bytes=0-${boundedEndByte}`;
}

function parseContentRangeTotal(contentRange: string | null) {
  if (!contentRange) {
    return null;
  }

  const match = /\/(\d+)$/.exec(contentRange.trim());
  if (!match) {
    return null;
  }

  const parsedValue = Number(match[1]);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function buildOriginalVideoProxyHeaders(input: {
  media: Awaited<ReturnType<typeof getMediaSummary>>;
  upstreamHeaders: Headers;
  preserveContentRange?: boolean;
}) {
  const headers = new Headers();
  const upstreamContentType = input.upstreamHeaders.get("content-type");
  const upstreamAcceptRanges = input.upstreamHeaders.get("accept-ranges");
  const upstreamContentRange = input.upstreamHeaders.get("content-range");
  const upstreamContentLength = input.upstreamHeaders.get("content-length");
  const totalBytes = input.media.size_bytes ?? parseContentRangeTotal(upstreamContentRange);

  headers.set("Content-Type", upstreamContentType || input.media.mime_type || "application/octet-stream");
  headers.set("Accept-Ranges", upstreamAcceptRanges || "bytes");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Antigravity-Media-Delivery", "video-original-proxy");

  if (input.preserveContentRange && upstreamContentRange) {
    headers.set("Content-Range", upstreamContentRange);
  }

  if (input.upstreamHeaders.has("etag")) {
    headers.set("ETag", input.upstreamHeaders.get("etag")!);
  }

  if (input.upstreamHeaders.has("last-modified")) {
    headers.set("Last-Modified", input.upstreamHeaders.get("last-modified")!);
  }

  if (input.preserveContentRange) {
    if (upstreamContentLength) {
      headers.set("Content-Length", upstreamContentLength);
    }
  } else if (totalBytes !== null) {
    headers.set("Content-Length", String(totalBytes));
  }

  return headers;
}

async function buildOriginalVideoProxyContext(mediaId: string, shareToken?: string | null) {
  const media = await getMediaSummary(mediaId, shareToken);
  if (!shouldProxyOriginalVideo(media, null, false)) {
    return null;
  }

  const resolvedAccess = await resolveMediaAccess(mediaId, shareToken, null, { download: false });
  return { media, resolvedAccess };
}

async function proxyOriginalVideoResponse(request: Request, context: NonNullable<Awaited<ReturnType<typeof buildOriginalVideoProxyContext>>>) {
  const upstreamHeaders = new Headers();
  const forcedInitialRangeHeader = buildForcedInitialChromeAndroidRange(request, context.media);
  const rangeHeader = request.headers.get("range") || forcedInitialRangeHeader;
  const ifRangeHeader = request.headers.get("if-range");

  if (rangeHeader) {
    upstreamHeaders.set("Range", rangeHeader);
  }

  if (ifRangeHeader) {
    upstreamHeaders.set("If-Range", ifRangeHeader);
  }

  const upstreamResponse = await fetch(context.resolvedAccess.url, {
    method: "GET",
    headers: upstreamHeaders,
    cache: "no-store",
  });

  if (!upstreamResponse.ok) {
    console.error("[media-route] original video proxy fetch failed", {
      mediaId: context.media.id,
      status: upstreamResponse.status,
      hasRange: Boolean(rangeHeader),
    });
    throw new AppError(502, "Не удалось получить оригинал видео.");
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: buildOriginalVideoProxyHeaders({
      media: context.media,
      upstreamHeaders: upstreamResponse.headers,
      preserveContentRange: upstreamResponse.status === 206,
    }),
  });
}

async function buildOriginalVideoHeadResponse(
  request: Request,
  context: NonNullable<Awaited<ReturnType<typeof buildOriginalVideoProxyContext>>>
) {
  const probeHeaders = new Headers();
  probeHeaders.set("Range", "bytes=0-0");

  const upstreamResponse = await fetch(context.resolvedAccess.url, {
    method: "GET",
    headers: probeHeaders,
    cache: "no-store",
  });

  if (!upstreamResponse.ok) {
    console.error("[media-route] original video HEAD probe failed", {
      mediaId: context.media.id,
      status: upstreamResponse.status,
    });
    throw new AppError(502, "Не удалось проверить оригинал видео.");
  }

  return new Response(null, {
    status: 200,
    headers: buildOriginalVideoProxyHeaders({
      media: context.media,
      upstreamHeaders: upstreamResponse.headers,
      preserveContentRange: false,
    }),
  });
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
        return await proxyPdfDocumentResponse({ mediaId, shareToken, media, download: true });
      }
    }

    if (!download && !variant) {
      const media = await getMediaSummary(mediaId, shareToken);
      if (media.kind === "document" && isPdfDocumentMimeType(media.mime_type)) {
        return await proxyPdfDocumentResponse({ mediaId, shareToken, media, download: false });
      }
    }

    const originalVideoProxyContext = await buildOriginalVideoProxyContext(mediaId, shareToken);
    if (originalVideoProxyContext) {
      return await proxyOriginalVideoResponse(request, originalVideoProxyContext);
    }

    const result = await resolveMediaAccess(mediaId, shareToken, variant, { download });
    return NextResponse.redirect(result.url);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function HEAD(request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const shareToken = searchParams.get("share");
    const download = searchParams.get("download") === "1";
    const rawVariant = searchParams.get("variant");
    const variant = !download && (rawVariant === "thumb" || rawVariant === "small" || rawVariant === "medium") ? rawVariant : null;

    const originalVideoProxyContext = await buildOriginalVideoProxyContext(mediaId, shareToken);
    if (originalVideoProxyContext) {
      return await buildOriginalVideoHeadResponse(request, originalVideoProxyContext);
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

