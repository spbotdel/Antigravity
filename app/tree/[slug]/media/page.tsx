import { TreeMediaArchiveClient } from "@/components/media/tree-media-archive-client";
import { TreeNav } from "@/components/layout/tree-nav";
import { buildDerivedUploaderAlbumSummaries, buildPersistedTreeMediaAlbumMediaMap, buildTreeMediaAlbumSummaries, collectTreeMedia } from "@/lib/tree/display";
import { getTreeMediaPageData } from "@/lib/server/repository";
import { formatTreeVisibility } from "@/lib/ui-text";

export const dynamic = "force-dynamic";

interface MediaPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

type MediaMode = "photo" | "video" | "all";
type ArchiveView = "all" | "albums";
type AlbumSummary = {
  id: string;
  title: string;
  description: string | null;
  albumKind: "manual" | "uploader";
  uploaderUserId: string | null;
  count: number;
  coverMediaId: string | null;
};

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

  if (value === "all") {
    return "all";
  }

  return "photo";
}

function resolveArchiveView(value: string | null): ArchiveView {
  return value === "albums" ? "albums" : "all";
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

  const photoMedia = collectTreeMedia({ media: pageData.media }, "photo");
  const videoMedia = collectTreeMedia({ media: pageData.media }, "video");
  const allMedia = collectTreeMedia({ media: pageData.media });
  const persistedAlbumMediaMap = buildPersistedTreeMediaAlbumMediaMap({
    media: pageData.media,
    items
  });
  const persistedAllAlbumSummaries = buildTreeMediaAlbumSummaries({
    media: pageData.media,
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
        .map((album) => album.uploaderUserId)
        .filter((value): value is string => Boolean(value))
    );

    return [
      ...persisted,
      ...derived.filter((album) => !album.uploaderUserId || !persistedUploaderIds.has(album.uploaderUserId))
    ];
  }

  const allAlbumSummaries = mergeAlbumSummaries(persistedAllAlbumSummaries, derivedAllAlbumSummaries);
  const photoAlbumSummaries = mergeAlbumSummaries(persistedPhotoAlbumSummaries, derivedPhotoAlbumSummaries);
  const videoAlbumSummaries = mergeAlbumSummaries(persistedVideoAlbumSummaries, derivedVideoAlbumSummaries);

  return (
    <main className="page-shell workspace-page">
      <section className="section-header workspace-header">
        <div className="workspace-header-main">
          <div className="workspace-meta-row">
            <p className="eyebrow">{formatTreeVisibility(pageData.tree.visibility)} дерево</p>
            <span className="workspace-meta-chip">{photoMedia.length} фото</span>
            <span className="workspace-meta-chip">{videoMedia.length} видео</span>
            <span className="workspace-meta-chip">{allAlbumSummaries.length} альбомов</span>
          </div>
          <h1>{pageData.tree.title}</h1>
          <p className="muted-copy">Семейный архив собирает общие фото и видео в одной галерее. Дальше он разовьется в режимы «Все» и «Альбомы» по образцу привычных фотоархивов.</p>
        </div>
        <TreeNav
          slug={slug}
          shareToken={shareToken}
          canEdit={pageData.actor.canEdit}
          canManageMembers={pageData.actor.canManageMembers}
          canReadAudit={pageData.actor.canReadAudit}
          canManageSettings={pageData.actor.canManageSettings}
        />
      </section>

      <TreeMediaArchiveClient
        treeId={pageData.tree.id}
        slug={slug}
        shareToken={shareToken}
        canEdit={pageData.actor.canEdit}
        initialMode={mode}
        initialView={view}
        initialAlbumId={albumId}
        allMedia={allMedia}
        allAlbums={persistedAllAlbumSummaries}
        persistedAlbumMediaMap={persistedAlbumMediaMap}
        uploaderLabels={Array.from(uploaderLabelsById.entries()).map(([userId, label]) => ({ userId, label }))}
      />
    </main>
  );
}
