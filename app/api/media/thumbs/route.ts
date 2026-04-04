import { hashOpaqueToken } from "@/lib/server/invite-token";
import { getCurrentUser } from "@/lib/server/auth";
import { toErrorResponse } from "@/lib/server/errors";
import { resolveTreeMediaThumbUrls } from "@/lib/server/repository";
import { resolveMediaThumbBatchSchema } from "@/lib/validators/media";

interface MediaThumbBatchCacheEntry {
  urlsByMediaId: Record<string, string>;
  expiresAt: number;
}

interface ResolvedMediaThumbBatchResult {
  cacheEntry: MediaThumbBatchCacheEntry;
  resolveDurationMs: number;
}

const MEDIA_THUMB_BATCH_CACHE_TTL_MS = 30_000;
const mediaThumbBatchCache = new Map<string, MediaThumbBatchCacheEntry>();
const mediaThumbBatchInFlight = new Map<string, Promise<ResolvedMediaThumbBatchResult>>();

function buildMediaThumbBatchResponse(
  urlsByMediaId: Record<string, string>,
  metadata: {
    cacheState: "hit" | "miss" | "inflight";
    totalDurationMs: number;
    resolveDurationMs: number;
    mediaCount: number;
  }
) {
  return Response.json(
    { urlsByMediaId },
    {
      headers: {
        "X-Archive-Thumb-Batch-Cache": metadata.cacheState,
        "X-Archive-Thumb-Batch-Count": String(metadata.mediaCount),
        "Server-Timing": `archive-thumb-batch-total;dur=${metadata.totalDurationMs.toFixed(1)}, archive-thumb-batch-resolve;dur=${metadata.resolveDurationMs.toFixed(1)}`
      }
    }
  );
}

function getFreshMediaThumbBatchCacheEntry(cacheKey: string) {
  const entry = mediaThumbBatchCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    mediaThumbBatchCache.delete(cacheKey);
    return null;
  }

  return entry;
}

function buildMediaThumbBatchActorScope(userId: string | null, shareToken?: string | null) {
  const shareScope = shareToken ? hashOpaqueToken(shareToken) : "none";
  return `user:${userId || "anonymous"}|share:${shareScope}`;
}

function buildMediaThumbBatchCacheKey(input: {
  treeId: string;
  mediaIds: string[];
  actorScope: string;
}) {
  return [
    "media-thumb-batch",
    `tree:${input.treeId}`,
    `actor:${input.actorScope}`,
    `media:${input.mediaIds.join(",")}`
  ].join("|");
}

export async function POST(request: Request) {
  try {
    const startedAt = performance.now();
    const searchParams = new URL(request.url).searchParams;
    const shareToken = searchParams.get("share");
    const payload = resolveMediaThumbBatchSchema.parse(await request.json());
    const resolvedUser = await getCurrentUser();
    const mediaIds = [...new Set(payload.mediaIds)].sort();
    const actorScope = buildMediaThumbBatchActorScope(resolvedUser?.id ?? null, shareToken);
    const cacheKey = buildMediaThumbBatchCacheKey({
      treeId: payload.treeId,
      mediaIds,
      actorScope
    });
    const cachedEntry = getFreshMediaThumbBatchCacheEntry(cacheKey);
    if (cachedEntry) {
      return buildMediaThumbBatchResponse(cachedEntry.urlsByMediaId, {
        cacheState: "hit",
        totalDurationMs: performance.now() - startedAt,
        resolveDurationMs: 0,
        mediaCount: mediaIds.length
      });
    }

    const inFlight = mediaThumbBatchInFlight.get(cacheKey);
    if (inFlight) {
      const waitStartedAt = performance.now();
      const result = await inFlight;
      return buildMediaThumbBatchResponse(result.cacheEntry.urlsByMediaId, {
        cacheState: "inflight",
        totalDurationMs: performance.now() - startedAt,
        resolveDurationMs: performance.now() - waitStartedAt,
        mediaCount: mediaIds.length
      });
    }

    const pendingResult = (async () => {
      const resolveStartedAt = performance.now();
      const urlsByMediaId = await resolveTreeMediaThumbUrls({
        treeId: payload.treeId,
        mediaIds,
        shareToken,
        resolvedUser
      });

      const cacheEntry: MediaThumbBatchCacheEntry = {
        urlsByMediaId,
        expiresAt: Date.now() + MEDIA_THUMB_BATCH_CACHE_TTL_MS
      };
      mediaThumbBatchCache.set(cacheKey, cacheEntry);
      return {
        cacheEntry,
        resolveDurationMs: performance.now() - resolveStartedAt
      };
    })();

    mediaThumbBatchInFlight.set(cacheKey, pendingResult);

    const result = await pendingResult.finally(() => {
      mediaThumbBatchInFlight.delete(cacheKey);
    });

    return buildMediaThumbBatchResponse(result.cacheEntry.urlsByMediaId, {
      cacheState: "miss",
      totalDurationMs: performance.now() - startedAt,
      resolveDurationMs: result.resolveDurationMs,
      mediaCount: mediaIds.length
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
