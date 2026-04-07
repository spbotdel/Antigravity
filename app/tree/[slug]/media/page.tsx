import { after } from "next/server";

import { AppHeader } from "@/components/layout/app-header";
import { TreeMediaArchiveClient } from "@/components/media/tree-media-archive-client";
import { TreeNav } from "@/components/layout/tree-nav";
import { resolveHeaderModeFromActor } from "@/lib/permissions";
import { buildDerivedUploaderAlbumSummaries, buildPersistedTreeMediaAlbumMediaMap, buildTreeMediaAlbumSummaries, collectArchiveGalleryMedia, collectTreeMedia } from "@/lib/tree/display";
import type { MediaAssetRecord } from "@/lib/types";
import { getCloudflareR2PublicBaseUrl } from "@/lib/env";
import { getTreeMediaPageData, processCloudflareVideoPreviewJobs, resolveMediaThumbUrlsForVisibleMedia } from "@/lib/server/repository";
import { formatTreeVisibility } from "@/lib/ui-text";

export const dynamic = "force-dynamic";
const INITIAL_ARCHIVE_TILE_LIMIT = 18;
const ALBUM_PREVIEW_MEDIA_LIMIT = 3;

interface MediaPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

type MediaMode = "photo" | "video" | "audio" | "document" | "all";
type ArchiveView = "all" | "albums";
type AlbumSummary = {
  id: string;
  title: string;
  description: string | null;
  kind: "photo" | "video" | "all";
  access: "public" | "members";
  albumKind: "manual" | "uploader";
  uploaderUserId: string | null;
  count: number;
  coverMediaId: string | null;
};

function mergeUploaderAlbumsForAllMedia(
  albums: AlbumSummary[],
  media: Array<{ id: string; created_by: string | null; kind: "photo" | "video" | "document" | "audio" }>
) {
  const merged = new Map<string, AlbumSummary>();
  const ordered: AlbumSummary[] = [];

  for (const album of albums) {
    if (album.albumKind !== "uploader" || !album.uploaderUserId) {
      ordered.push(album);
      continue;
    }

    if (merged.has(album.uploaderUserId)) {
      continue;
    }

    const uploaderMedia = media.filter(
      (asset) => asset.created_by === album.uploaderUserId && (asset.kind === "photo" || asset.kind === "video")
    );
    const cover =
      uploaderMedia.find((asset) => asset.kind === "photo") ||
      uploaderMedia[0] ||
      null;

    const mergedAlbum: AlbumSummary = {
      ...album,
      kind: "all",
      count: uploaderMedia.length,
      coverMediaId: cover?.id || null
    };

    merged.set(album.uploaderUserId, mergedAlbum);
    ordered.push(mergedAlbum);
  }

  return ordered;
}

function getSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function resolveMediaMode(value: string | null): MediaMode {
  if (value === "video") {
    return "video";
  }

  if (value === "audio") {
    return "audio";
  }

  if (value === "document") {
    return "document";
  }

  if (value === "all") {
    return "all";
  }

  return "photo";
}

function resolveArchiveView(value: string | null): ArchiveView {
  return value === "albums" ? "albums" : "all";
}

function getArchiveAlbumSourceMedia(
  album: Pick<AlbumSummary, "id" | "kind" | "albumKind" | "uploaderUserId">,
  currentMedia: MediaAssetRecord[],
  persistedAlbumMediaMap: Record<string, MediaAssetRecord[]>
) {
  if (album.albumKind === "uploader" && album.uploaderUserId) {
    return currentMedia.filter((asset) =>
      asset.created_by === album.uploaderUserId &&
      (album.kind === "all" ? asset.kind === "photo" || asset.kind === "video" : asset.kind === album.kind)
    );
  }

  return (persistedAlbumMediaMap[album.id] || []).filter((asset) =>
    album.kind === "all" ? asset.kind === "photo" || asset.kind === "video" : asset.kind === album.kind
  );
}

function isRecoverableCloudflareVideoPreview(asset: MediaAssetRecord) {
  return (
    asset.kind === "video" &&
    asset.provider === "cloudflare_r2" &&
    (asset.preview_status === "pending" || asset.preview_status === "processing")
  );
}

export default async function MediaPage({ params, searchParams }: MediaPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const shareToken = getSearchParam(resolvedSearchParams.share);
  const mode = resolveMediaMode(getSearchParam(resolvedSearchParams.mode));
  const view = resolveArchiveView(getSearchParam(resolvedSearchParams.view));
  const albumId = getSearchParam(resolvedSearchParams.album);
  const pageData = await getTreeMediaPageData(slug, { shareToken });
  const { albums, items, uploaderLabelsById } = pageData;
  const audioPlaylists = pageData.audioPlaylists || [];
  const audioPlaylistItems = pageData.audioPlaylistItems || [];
  const audioPlaylistsAvailable = pageData.audioPlaylistsAvailable !== false;

  const fullMedia = pageData.media;
  const photoMedia = collectTreeMedia({ media: fullMedia }, "photo");
  const videoMedia = collectTreeMedia({ media: fullMedia }, "video");
  const audioMedia = collectTreeMedia({ media: fullMedia }, "audio");
  const documentMedia = collectTreeMedia({ media: fullMedia }, "document");
  const allMedia = collectArchiveGalleryMedia({ media: fullMedia });
  const persistedAlbumMediaMap = buildPersistedTreeMediaAlbumMediaMap({
    media: fullMedia,
    items
  });
  const persistedAllAlbumSummaries = buildTreeMediaAlbumSummaries({
    media: allMedia,
    albums,
    items,
    albumMediaMap: persistedAlbumMediaMap
  });
  const persistedPhotoAlbumSummaries = buildTreeMediaAlbumSummaries({
    media: pageData.media,
    albums,
    items,
    albumMediaMap: persistedAlbumMediaMap,
    kind: "photo"
  });
  const persistedVideoAlbumSummaries = buildTreeMediaAlbumSummaries({
    media: pageData.media,
    albums,
    items,
    albumMediaMap: persistedAlbumMediaMap,
    kind: "video"
  });
  const derivedAllAlbumSummaries = buildDerivedUploaderAlbumSummaries({
    media: allMedia,
    uploaderLabelsById
  });
  const derivedPhotoAlbumSummaries = buildDerivedUploaderAlbumSummaries({
    media: photoMedia,
    kind: "photo",
    uploaderLabelsById
  });
  const derivedVideoAlbumSummaries = buildDerivedUploaderAlbumSummaries({
    media: videoMedia,
    kind: "video",
    uploaderLabelsById
  });

  function mergeAlbumSummaries(
    persisted: AlbumSummary[],
    derived: AlbumSummary[]
  ): AlbumSummary[] {
    const persistedUploaderIds = new Set(
      persisted
        .filter((album): album is AlbumSummary & { uploaderUserId: string } => Boolean(album.uploaderUserId))
        .map((album) => `${album.uploaderUserId}:${album.kind}`)
    );

    return [
      ...persisted,
      ...derived.filter((album) => !album.uploaderUserId || !persistedUploaderIds.has(`${album.uploaderUserId}:${album.kind}`))
    ];
  }

  const allAlbumSummaries = mergeUploaderAlbumsForAllMedia(
    mergeAlbumSummaries(persistedAllAlbumSummaries, derivedAllAlbumSummaries),
    allMedia
  );
  const photoAlbumSummaries = mergeAlbumSummaries(persistedPhotoAlbumSummaries, derivedPhotoAlbumSummaries);
  const videoAlbumSummaries = mergeAlbumSummaries(persistedVideoAlbumSummaries, derivedVideoAlbumSummaries);
  const currentMedia =
    mode === "photo"
      ? photoMedia
      : mode === "video"
        ? videoMedia
        : mode === "audio"
          ? audioMedia
          : mode === "document"
            ? documentMedia
            : allMedia;
  const currentAlbums =
    mode === "photo"
      ? photoAlbumSummaries
      : mode === "video"
        ? videoAlbumSummaries
        : mode === "all"
          ? allAlbumSummaries
          : [];
  const initialSelectedAlbum = view === "albums" && albumId ? currentAlbums.find((album) => album.id === albumId) || null : null;
  const initialSelectedAlbumMedia = initialSelectedAlbum
    ? getArchiveAlbumSourceMedia(initialSelectedAlbum, currentMedia, persistedAlbumMediaMap)
    : [];
  const initialThumbMediaIds = new Set(
    view === "all"
      ? currentMedia.slice(0, INITIAL_ARCHIVE_TILE_LIMIT).map((asset) => asset.id)
      : initialSelectedAlbum
        ? initialSelectedAlbumMedia.slice(0, INITIAL_ARCHIVE_TILE_LIMIT).map((asset) => asset.id)
        : currentAlbums.flatMap((album) => {
          const albumMedia = getArchiveAlbumSourceMedia(album, currentMedia, persistedAlbumMediaMap);
          const cover = album.coverMediaId ? albumMedia.find((asset) => asset.id === album.coverMediaId) || null : null;
          const orderedMedia = cover ? [cover, ...albumMedia.filter((asset) => asset.id !== cover.id)] : albumMedia;
          return orderedMedia.slice(0, ALBUM_PREVIEW_MEDIA_LIMIT).map((asset) => asset.id);
        })
  );
  const initialThumbUrlsByMediaId = await resolveMediaThumbUrlsForVisibleMedia(
    currentMedia.filter((asset) => initialThumbMediaIds.has(asset.id))
  );
  const previewRecoveryMediaIds = currentMedia
    .filter((asset) => initialThumbMediaIds.has(asset.id) && isRecoverableCloudflareVideoPreview(asset))
    .map((asset) => asset.id);

  if (pageData.actor.canEdit && previewRecoveryMediaIds.length) {
    after(async () => {
      try {
        await processCloudflareVideoPreviewJobs({
          mediaIds: previewRecoveryMediaIds
        });
      } catch (error) {
        console.error("[video-preview] media page recovery processing failed", error);
      }
    });
  }

  const headerMode = resolveHeaderModeFromActor(pageData.actor);

  return (
    <>
      <AppHeader mode={headerMode} showDashboardLink={headerMode === "admin"} />
      <main className="page-shell tree-page-shell utility-page-shell tree-page-nav-scope">
        <div className="tree-page-nav-row">
          <TreeNav
            slug={slug}
            shareToken={shareToken}
            canEdit={pageData.actor.canEdit}
            canManageMembers={pageData.actor.canManageMembers}
            canReadAudit={pageData.actor.canReadAudit}
            canManageSettings={pageData.actor.canManageSettings}
          />
        </div>
        <section className="section-header workspace-header utility-page-header">
          <div className="workspace-header-main">
            <div className="workspace-meta-row">
              <p className="eyebrow">Семейный архив</p>
              <span className="workspace-meta-chip">{formatTreeVisibility(pageData.tree.visibility)}</span>
              <span className="workspace-meta-chip">{allAlbumSummaries.length} альбомов</span>
            </div>
            <h1>{pageData.tree.title}</h1>
            <p className="muted-copy">Семейный архив собирает общие фото, видео, аудиозаписи и документы в одной галерее.</p>
          </div>
        </section>

        <TreeMediaArchiveClient
          treeId={pageData.tree.id}
          slug={slug}
          shareToken={shareToken}
          cloudflareR2PublicBaseUrl={getCloudflareR2PublicBaseUrl()}
          canEdit={pageData.actor.canEdit}
          initialMode={mode}
          initialView={view}
          initialAlbumId={albumId}
          allMedia={fullMedia}
          allAlbums={persistedAllAlbumSummaries}
          persistedAlbumMediaMap={persistedAlbumMediaMap}
          initialThumbUrlsByMediaId={initialThumbUrlsByMediaId}
          uploaderLabels={Array.from(uploaderLabelsById.entries()).map(([userId, label]) => ({ userId, label }))}
          audioPlaylists={audioPlaylists}
          audioPlaylistItems={audioPlaylistItems}
          audioPlaylistsAvailable={audioPlaylistsAvailable}
        />
      </main>
    </>
  );
}
