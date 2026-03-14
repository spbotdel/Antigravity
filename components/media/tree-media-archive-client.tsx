"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { buildDerivedUploaderAlbumSummaries, buildMediaOpenRouteUrl, buildPhotoPreviewRouteUrl, buildTreeMediaAlbumSummaries } from "@/lib/tree/display";
import { uploadFileWithTransportContract } from "@/lib/utils";
import type { MediaAssetRecord, MediaUploadTargetResponse, TreeMediaAlbumRecord } from "@/lib/types";

type MediaMode = "photo" | "video" | "all";
type ArchiveView = "all" | "albums";

interface AlbumSummary {
  id: string;
  title: string;
  description: string | null;
  albumKind: TreeMediaAlbumRecord["album_kind"];
  uploaderUserId: string | null;
  count: number;
  coverMediaId: string | null;
}

interface TreeMediaArchiveClientProps {
  treeId: string;
  slug: string;
  shareToken?: string | null;
  canEdit: boolean;
  initialMode: MediaMode;
  initialView: ArchiveView;
  initialAlbumId?: string | null;
  allMedia: MediaAssetRecord[];
  allAlbums: AlbumSummary[];
  persistedAlbumMediaMap: Record<string, MediaAssetRecord[]>;
  uploaderLabels: Array<{ userId: string; label: string }>;
}

const INITIAL_TILE_LIMIT = 18;
const MAX_PHOTO_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_DEFAULT_FILE_SIZE_BYTES = 100 * 1024 * 1024;

type ArchiveUploadTarget = Pick<
  MediaUploadTargetResponse,
  "mediaId" | "path" | "signedUrl" | "configuredBackend" | "resolvedUploadBackend" | "rolloutState" | "uploadMode" | "variantUploadMode" | "variantTargets"
>;

interface PendingArchiveUploadItem {
  id: string;
  file: File;
  previewUrl: string | null;
}

type ArchiveUploadStatus = "queued" | "uploading" | "finalizing" | "done" | "error";

function getArchiveMaxMediaFileSizeBytes(file: File) {
  if (file.type.startsWith("video/")) {
    return MAX_VIDEO_FILE_SIZE_BYTES;
  }

  if (file.type.startsWith("image/")) {
    return MAX_PHOTO_FILE_SIZE_BYTES;
  }

  return MAX_DEFAULT_FILE_SIZE_BYTES;
}

interface ActiveArchiveUploadItem {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedBytes: number;
  progressPercent: number;
  status: ArchiveUploadStatus;
  message: string | null;
}

function buildPersistedArchiveAlbumSummaries(input: {
  albums: AlbumSummary[];
  media: MediaAssetRecord[];
  albumMediaMap: Record<string, MediaAssetRecord[]>;
  kind?: Extract<MediaMode, "photo" | "video">;
}) {
  return input.albums
    .map((album) => {
      const albumAllMedia =
        album.albumKind === "uploader" && album.uploaderUserId
          ? input.albumMediaMap[album.id]?.length
            ? input.albumMediaMap[album.id]
            : input.media.filter((asset) => asset.created_by === album.uploaderUserId)
          : input.albumMediaMap[album.id] || [];
      const albumMedia = input.kind ? albumAllMedia.filter((asset) => asset.kind === input.kind) : albumAllMedia;
      const cover =
        albumMedia.find((asset) => asset.kind === "photo") ||
        albumAllMedia.find((asset) => asset.kind === "photo") ||
        albumMedia[0] ||
        albumAllMedia[0] ||
        null;

      return {
        ...album,
        count: albumMedia.length,
        coverMediaId: cover?.id || null,
      };
    })
    .filter(Boolean) as AlbumSummary[];
}

function buildPhotoUrl(asset: MediaAssetRecord, shareToken?: string | null) {
  return buildPhotoPreviewRouteUrl(asset, "thumb", shareToken);
}

function buildStageUrl(asset: MediaAssetRecord, shareToken?: string | null, expanded = false) {
  if (asset.kind === "photo") {
    return buildPhotoPreviewRouteUrl(asset, expanded ? "medium" : "small", shareToken);
  }

  return buildMediaOpenRouteUrl(asset, shareToken);
}

function buildOpenUrl(asset: MediaAssetRecord, shareToken?: string | null) {
  return buildMediaOpenRouteUrl(asset, shareToken);
}

function isPhotoAsset(asset: MediaAssetRecord) {
  return asset.kind === "photo";
}

function isInlineVideoAsset(asset: MediaAssetRecord) {
  return asset.kind === "video" && asset.provider !== "yandex_disk";
}

function isInlineRenderableAsset(asset: MediaAssetRecord) {
  return isPhotoAsset(asset) || isInlineVideoAsset(asset);
}

function getArchiveOpenLabel(asset: MediaAssetRecord) {
  if (asset.kind === "document") {
    return "Открыть документ";
  }

  if (asset.provider === "yandex_disk") {
    return "Открыть внешнее видео";
  }

  if (asset.kind === "video") {
    return "Открыть видео";
  }

  return "Открыть оригинал";
}

function getArchiveMediaSourceLabel(asset: MediaAssetRecord) {
  return asset.provider === "yandex_disk" ? "По ссылке" : "Файл";
}

function buildAlbumCoverUrl(coverMediaId: string | null, media: MediaAssetRecord[], shareToken?: string | null) {
  if (!coverMediaId) {
    return null;
  }

  const cover = media.find((asset) => asset.id === coverMediaId);
  if (!cover || cover.kind !== "photo") {
    return null;
  }

  return buildPhotoUrl(cover, shareToken);
}

function buildPendingArchiveUploadItem(file: File): PendingArchiveUploadItem {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : null
  };
}

async function uploadArchiveFileToTarget(
  target: ArchiveUploadTarget,
  file: File,
  onProgress?: (progress: { uploadedBytes: number; totalBytes: number; percent: number }) => void
) {
  await uploadFileWithTransportContract({
    target,
    file,
    onProgress,
    directErrorMessage: "Не удалось отправить файл напрямую в хранилище.",
    proxyErrorMessage: "Не удалось отправить файл на сервер.",
    proxyResponseErrorMessage: "Не удалось загрузить файл.",
    variantErrorMessage: "Не удалось подготовить preview-варианты.",
  });
}

export function TreeMediaArchiveClient({
  treeId,
  slug,
  shareToken,
  canEdit,
  initialMode,
  initialView,
  initialAlbumId = null,
  allMedia,
  allAlbums,
  persistedAlbumMediaMap,
  uploaderLabels
}: TreeMediaArchiveClientProps) {
  const [mode, setMode] = useState<MediaMode>(initialMode);
  const [view, setView] = useState<ArchiveView>(initialView);
  const [visibleItems, setVisibleItems] = useState(INITIAL_TILE_LIMIT);
  const [isHydrated, setIsHydrated] = useState(false);
  const [archiveMedia, setArchiveMedia] = useState(allMedia);
  const [persistedAllAlbums, setPersistedAllAlbums] = useState(allAlbums);
  const [isCreateAlbumOpen, setIsCreateAlbumOpen] = useState(false);
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumDescription, setAlbumDescription] = useState("");
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(initialView === "albums" ? initialAlbumId : null);
  const [reviewAlbumId, setReviewAlbumId] = useState<string>("");
  const [reviewVisibility, setReviewVisibility] = useState<"public" | "members">("members");
  const [reviewCaption, setReviewCaption] = useState("");
  const [pendingUploads, setPendingUploads] = useState<PendingArchiveUploadItem[]>([]);
  const [isUploadReviewOpen, setIsUploadReviewOpen] = useState(false);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [isSavingUploads, setIsSavingUploads] = useState(false);
  const [activeUploads, setActiveUploads] = useState<ActiveArchiveUploadItem[]>([]);
  const [viewerMediaIds, setViewerMediaIds] = useState<string[]>([]);
  const [viewerMediaId, setViewerMediaId] = useState<string | null>(null);
  const [isMediaViewerOpen, setIsMediaViewerOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reviewFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadsRef = useRef<PendingArchiveUploadItem[]>([]);
  const uploaderLabelsById = useMemo(() => new Map(uploaderLabels.map((item) => [item.userId, item.label] as const)), [uploaderLabels]);
  const [albumMediaMap, setAlbumMediaMap] = useState<Record<string, MediaAssetRecord[]>>(persistedAlbumMediaMap);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    setVisibleItems(INITIAL_TILE_LIMIT);
  }, [mode, view]);

  useEffect(() => {
    if (view !== "albums") {
      setSelectedAlbumId(null);
    }
  }, [view]);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    return () => {
      for (const item of pendingUploadsRef.current) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!isMediaViewerOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMediaViewerOpen]);

  useEffect(() => {
    if (!status) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setStatus((currentStatus) => (currentStatus === status ? null : currentStatus));
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [status]);

  const photoMedia = useMemo(() => archiveMedia.filter((asset) => asset.kind === "photo"), [archiveMedia]);
  const videoMedia = useMemo(() => archiveMedia.filter((asset) => asset.kind === "video"), [archiveMedia]);
  const allDerivedAlbums = useMemo(
    () =>
      buildDerivedUploaderAlbumSummaries({
        media: archiveMedia,
        uploaderLabelsById
      }),
    [archiveMedia, uploaderLabelsById]
  );
  const photoDerivedAlbums = useMemo(
    () =>
      buildDerivedUploaderAlbumSummaries({
        media: photoMedia,
        kind: "photo",
        uploaderLabelsById
      }),
    [photoMedia, uploaderLabelsById]
  );
  const videoDerivedAlbums = useMemo(
    () =>
      buildDerivedUploaderAlbumSummaries({
        media: videoMedia,
        kind: "video",
        uploaderLabelsById
      }),
    [videoMedia, uploaderLabelsById]
  );
  const persistedAllAlbumSummaries = useMemo(
    () =>
      buildPersistedArchiveAlbumSummaries({
        albums: persistedAllAlbums,
        media: archiveMedia,
        albumMediaMap,
      }),
    [albumMediaMap, archiveMedia, persistedAllAlbums]
  );
  const persistedPhotoAlbumSummaries = useMemo(
    () =>
      buildPersistedArchiveAlbumSummaries({
        albums: persistedAllAlbums,
        media: archiveMedia,
        albumMediaMap,
        kind: "photo",
      }),
    [albumMediaMap, archiveMedia, persistedAllAlbums]
  );
  const persistedVideoAlbumSummaries = useMemo(
    () =>
      buildPersistedArchiveAlbumSummaries({
        albums: persistedAllAlbums,
        media: archiveMedia,
        albumMediaMap,
        kind: "video",
      }),
    [albumMediaMap, archiveMedia, persistedAllAlbums]
  );

  function mergeAlbums(persisted: AlbumSummary[], derived: AlbumSummary[]) {
    const persistedUploaderIds = new Set(
      persisted.map((album) => album.uploaderUserId).filter((value): value is string => Boolean(value))
    );
    return [
      ...persisted,
      ...derived.filter((album) => !album.uploaderUserId || !persistedUploaderIds.has(album.uploaderUserId))
    ];
  }

  const allAlbumSummaries = useMemo(() => mergeAlbums(persistedAllAlbumSummaries, allDerivedAlbums), [persistedAllAlbumSummaries, allDerivedAlbums]);
  const photoAlbumSummaries = useMemo(() => mergeAlbums(persistedPhotoAlbumSummaries, photoDerivedAlbums), [persistedPhotoAlbumSummaries, photoDerivedAlbums]);
  const videoAlbumSummaries = useMemo(() => mergeAlbums(persistedVideoAlbumSummaries, videoDerivedAlbums), [persistedVideoAlbumSummaries, videoDerivedAlbums]);
  const manualAlbums = useMemo(
    () => persistedAllAlbumSummaries.filter((album) => album.albumKind === "manual"),
    [persistedAllAlbumSummaries]
  );

  const currentMedia = useMemo(() => {
    if (mode === "photo") {
      return photoMedia;
    }
    if (mode === "video") {
      return videoMedia;
    }
    return archiveMedia;
  }, [archiveMedia, mode, photoMedia, videoMedia]);

  const currentAlbums = useMemo(() => {
    if (mode === "photo") {
      return photoAlbumSummaries;
    }
    if (mode === "video") {
      return videoAlbumSummaries;
    }
    return allAlbumSummaries;
  }, [allAlbumSummaries, mode, photoAlbumSummaries, videoAlbumSummaries]);

  const visibleMedia = currentMedia.slice(0, visibleItems);
  const modeLabel = mode === "photo" ? "Фото" : mode === "video" ? "Видео" : "Все медиа";
  const itemLabel = mode === "photo" ? "фото" : mode === "video" ? "видео" : "материалов";
  const activeUpload = activeUploads.find((item) => item.status === "uploading" || item.status === "finalizing") || null;
  const selectedAlbum = selectedAlbumId ? currentAlbums.find((album) => album.id === selectedAlbumId) || null : null;
  const activeContextAlbum = view === "albums" ? selectedAlbum : null;
  const reviewTargetAlbumId = selectedAlbum?.albumKind === "manual" ? selectedAlbum.id : reviewAlbumId || null;
  const reviewTargetAlbum = reviewTargetAlbumId ? persistedAllAlbums.find((album) => album.id === reviewTargetAlbumId) || null : null;
  const selectedAlbumMedia = useMemo(() => {
    if (!selectedAlbum) {
      return [];
    }

    if (selectedAlbum.albumKind === "uploader" && selectedAlbum.uploaderUserId) {
      return currentMedia.filter((asset) => asset.created_by === selectedAlbum.uploaderUserId);
    }

    return (albumMediaMap[selectedAlbum.id] || []).filter((asset) => {
      if (mode === "all") {
        return true;
      }
      return asset.kind === mode;
    });
  }, [albumMediaMap, currentMedia, mode, selectedAlbum]);
  const viewerMedia = useMemo(
    () =>
      viewerMediaIds
        .map((assetId) => archiveMedia.find((asset) => asset.id === assetId) || null)
        .filter((asset): asset is MediaAssetRecord => Boolean(asset)),
    [archiveMedia, viewerMediaIds]
  );
  const viewerIndex = viewerMediaId ? viewerMedia.findIndex((asset) => asset.id === viewerMediaId) : -1;
  const resolvedViewerIndex = viewerIndex >= 0 ? viewerIndex : 0;
  const activeViewerAsset = viewerMedia[resolvedViewerIndex] || null;
  const canNavigateViewer = viewerMedia.length > 1;

  useEffect(() => {
    if (!viewerMedia.length) {
      if (isMediaViewerOpen) {
        setIsMediaViewerOpen(false);
      }
      if (viewerMediaId) {
        setViewerMediaId(null);
      }
      return;
    }

    if (viewerMediaId && viewerMedia.some((asset) => asset.id === viewerMediaId)) {
      return;
    }

    setViewerMediaId(viewerMedia[0]?.id || null);
  }, [isMediaViewerOpen, viewerMedia, viewerMediaId]);

  useEffect(() => {
    if (!isMediaViewerOpen || !activeViewerAsset) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMediaViewerOpen(false);
      }

      if (event.key === "ArrowLeft" && canNavigateViewer) {
        event.preventDefault();
        setViewerMediaId(viewerMedia[(resolvedViewerIndex - 1 + viewerMedia.length) % viewerMedia.length]?.id || null);
      }

      if (event.key === "ArrowRight" && canNavigateViewer) {
        event.preventDefault();
        setViewerMediaId(viewerMedia[(resolvedViewerIndex + 1) % viewerMedia.length]?.id || null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeViewerAsset, canNavigateViewer, isMediaViewerOpen, resolvedViewerIndex, viewerMedia]);

  function openMediaViewer(assetId: string, items: MediaAssetRecord[]) {
    setViewerMediaIds(items.map((asset) => asset.id));
    setViewerMediaId(assetId);
    setIsMediaViewerOpen(true);
  }

  function moveViewerSelection(direction: -1 | 1) {
    if (!viewerMedia.length) {
      return;
    }

    const nextIndex = (resolvedViewerIndex + direction + viewerMedia.length) % viewerMedia.length;
    setViewerMediaId(viewerMedia[nextIndex]?.id || null);
  }

  function renderArchiveTile(asset: MediaAssetRecord, items: MediaAssetRecord[]) {
    const imageUrl = asset.kind === "photo" && isHydrated ? buildPhotoUrl(asset, shareToken) : null;

    return (
      <button
        key={asset.id}
        type="button"
        className="archive-tile"
        aria-label={`${asset.kind === "photo" ? "Открыть фото" : asset.kind === "video" ? "Открыть видео" : "Открыть файл"}: ${asset.title}`}
        onClick={() => openMediaViewer(asset.id, items)}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" className="archive-tile-image" />
        ) : (
          <div className={`archive-tile-placeholder${asset.kind === "video" ? " archive-tile-placeholder-video" : ""}`}>
            <span>{asset.kind === "video" ? "▶" : asset.kind === "document" ? "DOC" : "IMG"}</span>
          </div>
        )}
        {asset.kind !== "photo" ? <span className="archive-tile-badge">{asset.kind === "video" ? "Видео" : "Файл"}</span> : null}
      </button>
    );
  }

  function switchMode(nextMode: MediaMode) {
    startTransition(() => {
      setMode(nextMode);
    });
  }

  function switchView(nextView: ArchiveView) {
    startTransition(() => {
      setView(nextView);
    });
  }

  async function requestJson(url: string, method: string, body: unknown) {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Запрос не выполнен.");
    }
    return payload;
  }

  async function handleCreateAlbum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsCreatingAlbum(true);
      const payload = await requestJson("/api/media/albums", "POST", {
        treeId,
        title: albumTitle,
        description: albumDescription
      });
      const album = payload.album as TreeMediaAlbumRecord;
      const summary: AlbumSummary = {
        id: album.id,
        title: album.title,
        description: album.description,
        albumKind: album.album_kind,
        uploaderUserId: album.uploader_user_id,
        count: 0,
        coverMediaId: null
      };
      setPersistedAllAlbums((current) => [summary, ...current]);
      setAlbumTitle("");
      setAlbumDescription("");
      setIsCreateAlbumOpen(false);
      setView("albums");
      setSelectedAlbumId(album.id);
      setStatus(payload.message || "Альбом создан.");
      setError(null);
    } catch (albumError) {
      setError(albumError instanceof Error ? albumError.message : "Не удалось создать альбом.");
    } finally {
      setIsCreatingAlbum(false);
    }
  }

  async function uploadArchiveFiles(
    files: PendingArchiveUploadItem[],
    manualAlbumId?: string | null,
    uploadOptions?: { visibility: "public" | "members"; caption: string }
  ) {
    for (let index = 0; index < files.length; index += 1) {
      const uploadItem = files[index];
      const file = uploadItem.file;
      const title = files.length === 1 ? file.name : `${file.name}`;
      const intent = (await requestJson("/api/media/archive/upload-intent", "POST", {
        treeId,
        filename: file.name,
        mimeType: file.type,
        visibility: uploadOptions?.visibility || "members",
        title,
        caption: uploadOptions?.caption || ""
      })) as ArchiveUploadTarget;

      setActiveUploads((current) =>
        current.map((item) =>
          item.id === uploadItem.id
            ? {
                ...item,
                status: "uploading",
                message: "Загружается"
              }
            : item
        )
      );

      await uploadArchiveFileToTarget(intent, file, (progress) => {
        setActiveUploads((current) =>
          current.map((item) =>
            item.id === uploadItem.id
              ? {
                  ...item,
                  uploadedBytes: progress.uploadedBytes,
                  sizeBytes: progress.totalBytes,
                  progressPercent: progress.percent,
                  status: "uploading",
                  message: "Загружается"
                }
              : item
          )
        );
      });

      setActiveUploads((current) =>
        current.map((item) =>
          item.id === uploadItem.id
            ? {
                ...item,
                uploadedBytes: file.size,
                sizeBytes: file.size,
                progressPercent: 100,
                status: "finalizing",
                message: "Сохраняется"
              }
            : item
        )
      );

      const completePayload = await requestJson("/api/media/archive/complete", "POST", {
        treeId,
        mediaId: intent.mediaId,
        albumId: manualAlbumId || undefined,
        storagePath: intent.path,
        variantPaths: intent.variantTargets?.map((item: { variant: "thumb" | "small" | "medium"; path: string }) => ({
          variant: item.variant,
          storagePath: item.path
        })),
        visibility: uploadOptions?.visibility || "members",
        title,
        caption: uploadOptions?.caption || "",
        mimeType: file.type,
        sizeBytes: file.size
      });

      const createdMedia = completePayload.media as MediaAssetRecord;
      const uploaderAlbumId =
        completePayload && typeof completePayload === "object" && "uploaderAlbumId" in completePayload && typeof completePayload.uploaderAlbumId === "string"
          ? completePayload.uploaderAlbumId
          : null;
      const albumIdsToUpdate = [...new Set([uploaderAlbumId, manualAlbumId].filter((value): value is string => Boolean(value)))];

      setArchiveMedia((current) => [createdMedia, ...current]);
      if (albumIdsToUpdate.length) {
        setAlbumMediaMap((current) => {
          const nextMap = { ...current };
          for (const albumId of albumIdsToUpdate) {
            const currentAlbumMedia = nextMap[albumId] || [];
            nextMap[albumId] = currentAlbumMedia.some((asset) => asset.id === createdMedia.id)
              ? currentAlbumMedia
              : [createdMedia, ...currentAlbumMedia];
          }
          return nextMap;
        });
      }
      setActiveUploads((current) =>
        current.map((item) =>
          item.id === uploadItem.id
            ? {
                ...item,
                uploadedBytes: file.size,
                sizeBytes: file.size,
                progressPercent: 100,
                status: "done",
                message: "Готово"
              }
            : item
        )
      );
      setError(null);
    }

    setStatus(files.length === 1 ? "Материал сохранен в семейный архив." : `Материалы сохранены: ${files.length}.`);
  }

  async function handleArchiveFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).filter((file) => file.size > 0);
    if (!files.length) {
      return;
    }

    const oversized = files.find((file) => file.size > getArchiveMaxMediaFileSizeBytes(file));
    if (oversized) {
      setError(`Файл больше ${Math.round(getArchiveMaxMediaFileSizeBytes(oversized) / (1024 * 1024))} МБ: ${oversized.name}.`);
      return;
    }

    const nextItems = files.map(buildPendingArchiveUploadItem);
      setPendingUploads((current) => [...current, ...nextItems]);
      if (selectedAlbum?.albumKind === "manual") {
        setReviewAlbumId(selectedAlbum.id);
      }
      setIsUploadReviewOpen(true);
      setError(null);

    if (event.target instanceof HTMLInputElement) {
      event.target.value = "";
    }
  }

  function removePendingUpload(itemId: string) {
    setPendingUploads((current) => {
      const item = current.find((entry) => entry.id === itemId);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return current.filter((entry) => entry.id !== itemId);
    });
  }

  function closeUploadReview() {
    if (isSavingUploads) {
      return;
    }

    if (pendingUploads.length) {
      setIsDiscardConfirmOpen(true);
      return;
    }

    setIsUploadReviewOpen(false);
  }

  function discardPendingUploads() {
    for (const item of pendingUploads) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
    setPendingUploads([]);
    setReviewAlbumId("");
    setReviewVisibility("members");
    setReviewCaption("");
    setIsDiscardConfirmOpen(false);
    setIsUploadReviewOpen(false);
  }

  async function savePendingUploads() {
    if (!pendingUploads.length) {
      setIsUploadReviewOpen(false);
      return;
    }

    try {
      setIsSavingUploads(true);
      const uploads = pendingUploads.map((item) => ({
        id: item.id,
        file: item.file,
        previewUrl: item.previewUrl
      }));
      const uploadOptions = {
        visibility: reviewVisibility,
        caption: reviewCaption.trim()
      };
      setActiveUploads(
        uploads.map((item) => ({
          id: item.id,
          name: item.file.name,
          sizeBytes: item.file.size,
          uploadedBytes: 0,
          progressPercent: 0,
          status: "queued" as const,
          message: "Ждет очереди"
        }))
      );
      for (const item of pendingUploads) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
      setPendingUploads([]);
      setReviewAlbumId("");
      setReviewVisibility("members");
      setReviewCaption("");
      setIsUploadReviewOpen(false);
      setIsDiscardConfirmOpen(false);
      setStatus(null);
      setError(null);
      void uploadArchiveFiles(uploads, reviewTargetAlbumId, uploadOptions).catch((uploadError) => {
        setStatus(null);
        setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить материалы в архив.");
      }).finally(() => {
        setIsSavingUploads(false);
        setActiveUploads([]);
      });
    } catch (uploadError) {
      setStatus(null);
      setActiveUploads([]);
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить материалы в архив.");
    }

    if (reviewFileInputRef.current) {
      reviewFileInputRef.current.value = "";
    }
  }

  function renderArchiveEmptyState(input: {
    title: string;
    description: string;
    actions?: ReactNode;
  }) {
    return (
      <div className="empty-state archive-empty-state">
        <div className="empty-state-copy">
          <strong>{input.title}</strong>
          <p>{input.description}</p>
        </div>
        {input.actions ? <div className="card-actions empty-state-actions">{input.actions}</div> : null}
      </div>
    );
  }

  return (
    <section className="surface-card archive-card">
      <div className="archive-header">
        <div className="archive-header-copy">
          <p className="eyebrow">Семейный архив</p>
          <h2>{modeLabel}</h2>
        </div>
        {canEdit ? (
          <div className="archive-action-bar archive-header-actions">
            <input
              ref={fileInputRef}
              className="builder-native-file-input"
              type="file"
              multiple
              accept={mode === "photo" ? "image/*" : mode === "video" ? "video/*" : "image/*,video/*,.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx"}
              onChange={handleArchiveFileSelection}
            />
            <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
              {mode === "photo" ? "Загрузить фото" : mode === "video" ? "Загрузить видео" : "Загрузить файлы"}
            </button>
            <button type="button" className="ghost-button" onClick={() => setIsCreateAlbumOpen(true)}>
              Создать альбом
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {activeUploads.length ? (
        <div className="archive-upload-panel">
          <strong>{activeUpload ? `Загрузка ${activeUpload.progressPercent}%` : "Загрузка завершена"}</strong>
          <div className="builder-upload-progress-bar">
            <span
              style={{
                width: `${Math.round(
                  activeUploads.reduce((sum, item) => sum + item.progressPercent, 0) / Math.max(activeUploads.length, 1)
                )}%`
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="pill-nav">
        <button type="button" className={`pill-link${mode === "photo" ? " pill-link-active" : ""}`} onClick={() => switchMode("photo")}>
          Фото
        </button>
        <button type="button" className={`pill-link${mode === "video" ? " pill-link-active" : ""}`} onClick={() => switchMode("video")}>
          Видео
        </button>
        <button type="button" className={`pill-link${mode === "all" ? " pill-link-active" : ""}`} onClick={() => switchMode("all")}>
          Все медиа
        </button>
      </div>

      <div className="pill-nav">
        <button type="button" className={`pill-link${view === "all" ? " pill-link-active" : ""}`} onClick={() => switchView("all")}>
          Все
        </button>
        <button type="button" className={`pill-link${view === "albums" ? " pill-link-active" : ""}`} onClick={() => switchView("albums")}>
          Альбомы
        </button>
      </div>

      {view === "all" ? (
        currentMedia.length ? (
          <>
            <div className="archive-grid">
              {visibleMedia.map((asset) => renderArchiveTile(asset, currentMedia))}
            </div>

            {visibleItems < currentMedia.length ? (
              <div className="card-actions archive-actions">
                <button type="button" className="ghost-button" onClick={() => setVisibleItems((current) => current + INITIAL_TILE_LIMIT)}>
                  Показать еще
                </button>
                <span className="members-static-note">
                  Показано {Math.min(visibleItems, currentMedia.length)} из {currentMedia.length} {itemLabel}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          renderArchiveEmptyState({
            title: mode === "photo" ? "В этом разделе пока нет фотографий" : mode === "video" ? "В этом разделе пока нет видео" : "Семейный архив пока пуст",
            description: canEdit
              ? "Начните с первого набора материалов: загрузите файлы или сразу подготовьте альбом под семейную подборку."
              : "Когда в архиве появятся материалы, они будут собраны здесь в спокойной галерее.",
            actions: canEdit ? (
              <>
                <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                  {mode === "photo" ? "Загрузить фото" : mode === "video" ? "Загрузить видео" : "Загрузить файлы"}
                </button>
                <button type="button" className="ghost-button" onClick={() => setIsCreateAlbumOpen(true)}>
                  Создать альбом
                </button>
              </>
            ) : null
          })
        )
      ) : selectedAlbum ? (
        <>
          <div className="archive-subheader">
            <button type="button" className="ghost-button archive-subheader-back" onClick={() => setSelectedAlbumId(null)}>
              Назад к альбомам
            </button>
            <div className="archive-subheader-copy">
              <strong>{selectedAlbum.title}</strong>
              <span>{selectedAlbumMedia.length} {mode === "all" ? "материалов" : itemLabel}</span>
            </div>
          </div>
          {selectedAlbumMedia.length ? (
            <div className="archive-grid">
              {selectedAlbumMedia.map((asset) => renderArchiveTile(asset, selectedAlbumMedia))}
            </div>
          ) : (
            renderArchiveEmptyState({
              title: mode === "all" ? `В альбоме «${selectedAlbum.title}» пока пусто` : `В альбоме «${selectedAlbum.title}» пока нет материалов этого типа`,
              description: canEdit
                ? "Можно добавить сюда новый набор файлов или вернуться к альбомам и выбрать другую подборку."
                : "Когда в выбранном альбоме появятся материалы этого типа, они откроются здесь.",
              actions: canEdit ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                    {mode === "photo" ? "Загрузить фото" : mode === "video" ? "Загрузить видео" : "Загрузить файлы"}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => setSelectedAlbumId(null)}>
                    Назад к альбомам
                  </button>
                </>
              ) : null
            })
          )}
        </>
      ) : currentAlbums.length ? (
        <div className="archive-album-grid">
          {currentAlbums.map((album) => {
            const coverUrl = isHydrated ? buildAlbumCoverUrl(album.coverMediaId, allMedia, shareToken) : null;

            return (
              <button key={album.id} type="button" className="archive-album-card" onClick={() => setSelectedAlbumId(album.id)}>
                <div className="archive-album-cover">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" loading="lazy" className="archive-album-image" />
                  ) : (
                    <div className="archive-tile-placeholder">
                      <span>{mode === "video" ? "▶" : "IMG"}</span>
                    </div>
                  )}
                </div>
                <div className="archive-album-copy">
                  <strong>{album.title}</strong>
                  <span>{album.count} {mode === "all" ? "материалов" : itemLabel}</span>
                  <small>{album.albumKind === "uploader" ? "Автоальбом загрузившего" : "Пользовательский альбом"}</small>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        renderArchiveEmptyState({
          title: "Альбомов для этого раздела пока нет",
          description: canEdit
            ? "Создайте первый альбом для семейной подборки, чтобы складывать туда поездки, праздники и другие общие серии."
            : "Когда владелец или редактор соберет альбомы, они появятся здесь.",
          actions: canEdit ? (
            <button type="button" className="secondary-button" onClick={() => setIsCreateAlbumOpen(true)}>
              Создать альбом
            </button>
          ) : null
        })
      )}

      <div className="archive-sticky-footer">
        <div className="archive-sticky-copy">
          <strong>{activeContextAlbum ? activeContextAlbum.title : modeLabel}</strong>
          <span>
            {activeContextAlbum
              ? `${selectedAlbumMedia.length} ${mode === "all" ? "материалов" : itemLabel} в альбоме`
              : `${currentMedia.length} ${mode === "all" ? "материалов" : itemLabel} в текущем режиме`}
          </span>
        </div>
        <div className="archive-action-bar">
          {view === "albums" && activeContextAlbum ? (
            <button type="button" className="ghost-button" onClick={() => setSelectedAlbumId(null)}>
              Назад к альбомам
            </button>
          ) : null}
          {view === "all" && visibleItems < currentMedia.length ? (
            <button type="button" className="ghost-button" onClick={() => setVisibleItems((current) => current + INITIAL_TILE_LIMIT)}>
              Показать еще
            </button>
          ) : null}
          {canEdit ? (
            <>
              <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                {mode === "photo" ? "Загрузить фото" : mode === "video" ? "Загрузить видео" : "Загрузить файлы"}
              </button>
              <button type="button" className="ghost-button" onClick={() => setIsCreateAlbumOpen(true)}>
                Создать альбом
              </button>
            </>
          ) : null}
        </div>
      </div>

      {isMediaViewerOpen && activeViewerAsset ? (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Просмотр архива: ${activeViewerAsset.title}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsMediaViewerOpen(false);
            }
          }}
        >
          <div className="media-lightbox-dialog archive-media-dialog">
            <div className="media-lightbox-header">
              <div className="media-lightbox-copy">
                <div className="media-meta">
                  <span>{activeViewerAsset.kind === "photo" ? "Фото" : activeViewerAsset.kind === "video" ? "Видео" : "Документ"}</span>
                  <span>{getArchiveMediaSourceLabel(activeViewerAsset)}</span>
                  <span>{activeContextAlbum ? activeContextAlbum.title : modeLabel}</span>
                </div>
                <h3>{activeViewerAsset.title}</h3>
                {activeViewerAsset.caption ? <p>{activeViewerAsset.caption}</p> : null}
              </div>
              <div className="media-lightbox-actions">
                <a href={buildOpenUrl(activeViewerAsset, shareToken)} target="_blank" rel="noreferrer" className="ghost-button">
                  {getArchiveOpenLabel(activeViewerAsset)}
                </a>
                <button type="button" className="ghost-button" onClick={() => setIsMediaViewerOpen(false)}>
                  Закрыть
                </button>
              </div>
            </div>

            <div className="media-lightbox-body">
              {canNavigateViewer ? (
                <button type="button" className="media-lightbox-nav" aria-label="Предыдущее медиа" onClick={() => moveViewerSelection(-1)}>
                  ‹
                </button>
              ) : null}

              <div className="media-lightbox-stage archive-media-stage">
                {isPhotoAsset(activeViewerAsset) ? (
                  <img src={buildStageUrl(activeViewerAsset, shareToken, true)} alt={activeViewerAsset.title} className="person-media-stage-photo" />
                ) : isInlineVideoAsset(activeViewerAsset) ? (
                  <video
                    key={activeViewerAsset.id}
                    src={buildOpenUrl(activeViewerAsset, shareToken)}
                    className="person-media-stage-video"
                    controls
                    playsInline
                    preload="metadata"
                  >
                    Ваш браузер не поддерживает встроенное воспроизведение видео.
                  </video>
                ) : (
                  <div className="person-media-placeholder archive-media-placeholder">
                    <strong>{activeViewerAsset.provider === "yandex_disk" ? "Видео по ссылке" : "Файл открывается отдельно"}</strong>
                    <p>{activeViewerAsset.caption || "Для этого материала доступно только открытие по отдельной ссылке."}</p>
                    <a href={buildOpenUrl(activeViewerAsset, shareToken)} target="_blank" rel="noreferrer" className="ghost-button">
                      {getArchiveOpenLabel(activeViewerAsset)}
                    </a>
                  </div>
                )}
              </div>

              {canNavigateViewer ? (
                <button type="button" className="media-lightbox-nav" aria-label="Следующее медиа" onClick={() => moveViewerSelection(1)}>
                  ›
                </button>
              ) : null}
            </div>

            {viewerMedia.length > 1 ? (
              <div className="archive-viewer-strip">
                {viewerMedia.map((asset) => {
                  const imageUrl = asset.kind === "photo" ? buildPhotoUrl(asset, shareToken) : null;

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`archive-viewer-thumb${asset.id === activeViewerAsset.id ? " archive-viewer-thumb-active" : ""}`}
                      onClick={() => setViewerMediaId(asset.id)}
                    >
                      {imageUrl ? (
                        <img src={imageUrl} alt="" loading="lazy" className="archive-tile-image" />
                      ) : (
                        <div className={`archive-tile-placeholder${asset.kind === "video" ? " archive-tile-placeholder-video" : ""}`}>
                          <span>{asset.kind === "video" ? "▶" : asset.kind === "document" ? "DOC" : "IMG"}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isCreateAlbumOpen ? (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Создать альбом"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsCreateAlbumOpen(false);
            }
          }}
        >
          <div className="media-lightbox-dialog archive-dialog">
            <div className="media-lightbox-header">
              <div className="media-lightbox-copy">
                <h3>Создать альбом</h3>
                <p>Сюда можно будет складывать отдельные семейные подборки: свадьбы, дни рождения, поездки и другие общие архивы.</p>
              </div>
            </div>
            <form className="stack-form archive-album-form" onSubmit={handleCreateAlbum}>
              <label>
                Название
                <input value={albumTitle} onChange={(event) => setAlbumTitle(event.target.value)} required maxLength={120} />
              </label>
              <label>
                Описание
                <textarea value={albumDescription} onChange={(event) => setAlbumDescription(event.target.value)} rows={4} maxLength={512} />
              </label>
              <div className="card-actions archive-actions">
                <button type="button" className="ghost-button" disabled={isCreatingAlbum} onClick={() => setIsCreateAlbumOpen(false)}>
                  Отмена
                </button>
                <button type="submit" className="primary-button" disabled={isCreatingAlbum}>
                  {isCreatingAlbum ? "Создаю альбом..." : "Создать альбом"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isUploadReviewOpen ? (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Подготовка загрузки"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeUploadReview();
            }
          }}
        >
          <div className="media-lightbox-dialog archive-dialog">
            <div className="media-lightbox-header">
              <div className="media-lightbox-copy">
                <h3>Подготовка загрузки</h3>
                <p>
                  {reviewTargetAlbum
                    ? `Новые материалы попадут в альбом «${reviewTargetAlbum.title}».`
                    : "Выберите, что именно сохранить в семейный архив."}
                </p>
              </div>
            </div>
            {selectedAlbum?.albumKind !== "manual" && manualAlbums.length ? (
              <label className="archive-field">
                Куда сохранить
                <select value={reviewAlbumId} onChange={(event) => setReviewAlbumId(event.target.value)}>
                  <option value="">Только в общий архив</option>
                  {manualAlbums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="builder-review-controls">
              <label className="archive-field">
                Видимость
                <select value={reviewVisibility} onChange={(event) => setReviewVisibility(event.target.value as "public" | "members")}>
                  <option value="members">Только участникам</option>
                  <option value="public">Всем по ссылке</option>
                </select>
              </label>
              <label className="archive-field">
                Подпись
                <textarea
                  rows={3}
                  value={reviewCaption}
                  onChange={(event) => setReviewCaption(event.target.value)}
                  placeholder="Общая подпись для выбранных файлов, если она нужна"
                />
              </label>
            </div>
            <div className="archive-review-body">
              <div className={`archive-grid archive-review-grid${pendingUploads.length > 8 ? " archive-review-grid-dense" : ""}`}>
                {pendingUploads.map((item) => (
                  <article key={item.id} className="archive-review-tile">
                    <button
                      type="button"
                      className="archive-remove-button"
                      aria-label={`Убрать файл ${item.file.name}`}
                      onClick={() => removePendingUpload(item.id)}
                    >
                      ×
                    </button>
                    {item.previewUrl && item.file.type.startsWith("video/") ? (
                      <video src={item.previewUrl} className="archive-tile-video" muted playsInline preload="metadata" />
                    ) : item.previewUrl ? (
                      <img src={item.previewUrl} alt="" className="archive-tile-image" />
                    ) : (
                      <div className={`archive-tile-placeholder${item.file.type.startsWith("video/") ? " archive-tile-placeholder-video" : ""}`}>
                        <span>{item.file.type.startsWith("video/") ? "▶" : "DOC"}</span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
            <div className="archive-action-bar archive-review-footer">
              <input
                ref={reviewFileInputRef}
                className="builder-native-file-input"
                type="file"
                multiple
                accept={mode === "photo" ? "image/*" : mode === "video" ? "video/*" : "image/*,video/*,.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx"}
                onChange={handleArchiveFileSelection}
              />
              <button type="button" className="ghost-button" onClick={() => reviewFileInputRef.current?.click()}>
                Добавить еще
              </button>
              <button type="button" className="ghost-button" onClick={closeUploadReview}>
                Отмена
              </button>
              <button type="button" className="primary-button" disabled={isSavingUploads} onClick={() => void savePendingUploads()}>
                {isSavingUploads ? "Сохраняем..." : `Сохранить ${pendingUploads.length}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDiscardConfirmOpen ? (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Закрыть окно загрузки"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsDiscardConfirmOpen(false);
            }
          }}
        >
          <div className="media-lightbox-dialog archive-confirm-dialog">
            <div className="media-lightbox-copy">
              <h3>Закрыть окно загрузки?</h3>
              <p>Некоторые выбранные файлы еще не сохранены. Если закрыть окно сейчас, этот набор пропадет.</p>
            </div>
            <div className="card-actions archive-actions">
              <button type="button" className="ghost-button" onClick={() => setIsDiscardConfirmOpen(false)}>
                Отмена
              </button>
              <button type="button" className="primary-button" onClick={discardPendingUploads}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {status ? (
        <div className="builder-status-toast" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
    </section>
  );
}
