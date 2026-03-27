"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectField } from "@/components/ui/select-field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { buildDerivedUploaderAlbumSummaries, buildMediaOpenRouteUrl, buildPhotoPreviewRouteUrl, buildTreeMediaAlbumSummaries } from "@/lib/tree/display";
import { uploadFileWithTransportContract } from "@/lib/utils";
import type { MediaAssetRecord, MediaUploadTargetResponse, TreeMediaAlbumRecord } from "@/lib/types";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";

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

interface ArchiveAlbumOption {
  id: string;
  title: string;
  href: string;
}

const INITIAL_TILE_LIMIT = 18;
const MAX_PHOTO_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_DEFAULT_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const CREATE_ALBUM_OPTION_VALUE = "__create_album__";

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

function formatArchiveFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} КБ`;
  }

  return `${sizeBytes} Б`;
}

function getArchiveUploadItemKindLabel(file: File) {
  if (file.type.startsWith("image/")) {
    return "Фото";
  }

  if (file.type.startsWith("video/")) {
    return "Видео";
  }

  return "Файл";
}

function buildPendingUploadSummary(items: PendingArchiveUploadItem[]) {
  const stats = items.reduce(
    (accumulator, item) => {
      accumulator.totalBytes += item.file.size;

      if (item.file.type.startsWith("image/")) {
        accumulator.photoCount += 1;
      } else if (item.file.type.startsWith("video/")) {
        accumulator.videoCount += 1;
      } else {
        accumulator.otherCount += 1;
      }

      return accumulator;
    },
    {
      totalBytes: 0,
      photoCount: 0,
      videoCount: 0,
      otherCount: 0,
    }
  );
  const parts = [`${items.length} ${items.length === 1 ? "файл" : items.length < 5 ? "файла" : "файлов"}`];

  if (stats.photoCount) {
    parts.push(`${stats.photoCount} фото`);
  }

  if (stats.videoCount) {
    parts.push(`${stats.videoCount} видео`);
  }

  if (stats.otherCount) {
    parts.push(`${stats.otherCount} ${stats.otherCount === 1 ? "документ" : stats.otherCount < 5 ? "документа" : "документов"}`);
  }

  parts.push(formatArchiveFileSize(stats.totalBytes));

  return parts.join(" • ");
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
        input.kind === "video"
          ? albumMedia.find((asset) => asset.kind === "video") || null
          : input.kind === "photo"
            ? albumMedia.find((asset) => asset.kind === "photo") ||
              albumAllMedia.find((asset) => asset.kind === "photo") ||
              null
            : albumMedia.find((asset) => asset.kind === "photo") ||
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

function buildDownloadUrl(asset: MediaAssetRecord, shareToken?: string | null) {
  const params = new URLSearchParams();
  params.set("download", "1");
  if (shareToken) {
    params.set("share", shareToken);
  }
  return `/api/media/${asset.id}?${params.toString()}`;
}

function areStringSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
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

function renderArchivePlaceholder(kind: MediaAssetRecord["kind"] | "file") {
  const isVideo = kind === "video";

  return (
    <div className={`archive-tile-placeholder${isVideo ? " archive-tile-placeholder-video" : ""}`}>
      <span className={`archive-tile-placeholder-mark${isVideo ? " archive-tile-placeholder-mark-video" : ""}`} aria-hidden="true" />
    </div>
  );
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
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [editAlbumTitle, setEditAlbumTitle] = useState("");
  const [editAlbumDescription, setEditAlbumDescription] = useState("");
  const [isUpdatingAlbum, setIsUpdatingAlbum] = useState(false);
  const [deleteTargetAlbumId, setDeleteTargetAlbumId] = useState<string | null>(null);
  const [isDeletingAlbum, setIsDeletingAlbum] = useState(false);
  const [dismissedUploaderAlbumUserIds, setDismissedUploaderAlbumUserIds] = useState<Set<string>>(() => new Set());
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(initialView === "albums" ? initialAlbumId : null);
  const [reviewAlbumId, setReviewAlbumId] = useState<string>("");
  const [reviewVisibility, setReviewVisibility] = useState<"public" | "members">("members");
  const [reviewCaption, setReviewCaption] = useState("");
  const [pendingUploads, setPendingUploads] = useState<PendingArchiveUploadItem[]>([]);
  const [isUploadReviewOpen, setIsUploadReviewOpen] = useState(false);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [resumeUploadReviewAfterAlbumCreate, setResumeUploadReviewAfterAlbumCreate] = useState(false);
  const [isSavingUploads, setIsSavingUploads] = useState(false);
  const [activeUploads, setActiveUploads] = useState<ActiveArchiveUploadItem[]>([]);
  const [viewerMediaIds, setViewerMediaIds] = useState<string[]>([]);
  const [viewerMediaId, setViewerMediaId] = useState<string | null>(null);
  const [isMediaViewerOpen, setIsMediaViewerOpen] = useState(false);
  const [isArchiveSelectionMode, setIsArchiveSelectionMode] = useState(false);
  const [selectedArchiveMediaIds, setSelectedArchiveMediaIds] = useState<Set<string>>(() => new Set());
  const [isAddToAlbumPickerOpen, setIsAddToAlbumPickerOpen] = useState(false);
  const [bulkAddAlbumId, setBulkAddAlbumId] = useState("");
  const [isAddingToAlbum, setIsAddingToAlbum] = useState(false);
  const [isDownloadingArchiveMedia, setIsDownloadingArchiveMedia] = useState(false);
  const [openArchiveActionsMediaId, setOpenArchiveActionsMediaId] = useState<string | null>(null);
  const [openArchiveAlbumChooserMediaId, setOpenArchiveAlbumChooserMediaId] = useState<string | null>(null);
  const [openArchiveAlbumActionsId, setOpenArchiveAlbumActionsId] = useState<string | null>(null);
  const [deleteTargetMediaId, setDeleteTargetMediaId] = useState<string | null>(null);
  const [isDeletingArchiveMedia, setIsDeletingArchiveMedia] = useState(false);
  const [isBulkArchiveDeleteConfirmOpen, setIsBulkArchiveDeleteConfirmOpen] = useState(false);
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
      ...derived.filter((album) =>
        !album.uploaderUserId ||
        (!persistedUploaderIds.has(album.uploaderUserId) && !dismissedUploaderAlbumUserIds.has(album.uploaderUserId))
      )
    ];
  }

  const allAlbumSummaries = useMemo(() => mergeAlbums(persistedAllAlbumSummaries, allDerivedAlbums), [persistedAllAlbumSummaries, allDerivedAlbums, dismissedUploaderAlbumUserIds]);
  const photoAlbumSummaries = useMemo(() => mergeAlbums(persistedPhotoAlbumSummaries, photoDerivedAlbums), [persistedPhotoAlbumSummaries, photoDerivedAlbums, dismissedUploaderAlbumUserIds]);
  const videoAlbumSummaries = useMemo(() => mergeAlbums(persistedVideoAlbumSummaries, videoDerivedAlbums), [persistedVideoAlbumSummaries, videoDerivedAlbums, dismissedUploaderAlbumUserIds]);
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
  const selectedArchiveMediaCount = selectedArchiveMediaIds.size;

  const visibleMedia = currentMedia.slice(0, visibleItems);
  const modeLabel = mode === "photo" ? "Фото" : mode === "video" ? "Видео" : "Все медиа";
  const itemLabel = mode === "photo" ? "фото" : mode === "video" ? "видео" : "материалов";
  const activeUpload = activeUploads.find((item) => item.status === "uploading" || item.status === "finalizing") || null;
  const selectedAlbum = selectedAlbumId ? currentAlbums.find((album) => album.id === selectedAlbumId) || null : null;
  const activeContextAlbum = view === "albums" ? selectedAlbum : null;
  const editingAlbum = editingAlbumId ? persistedAllAlbums.find((album) => album.id === editingAlbumId) || null : null;
  const deleteTargetAlbum = deleteTargetAlbumId ? persistedAllAlbums.find((album) => album.id === deleteTargetAlbumId) || null : null;
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

  useEffect(() => {
    setIsArchiveSelectionMode(false);
    setSelectedArchiveMediaIds(new Set());
    setIsBulkArchiveDeleteConfirmOpen(false);
    setIsAddToAlbumPickerOpen(false);
    setBulkAddAlbumId("");
    setOpenArchiveActionsMediaId(null);
    setOpenArchiveAlbumChooserMediaId(null);
    setOpenArchiveAlbumActionsId(null);
  }, [mode, view, selectedAlbumId]);

  useEffect(() => {
    const availableArchiveMediaIds = new Set(archiveMedia.map((asset) => asset.id));
    setSelectedArchiveMediaIds((currentSelection) => {
      const nextSelection = new Set([...currentSelection].filter((mediaId) => availableArchiveMediaIds.has(mediaId)));
      return areStringSetsEqual(currentSelection, nextSelection) ? currentSelection : nextSelection;
    });
  }, [archiveMedia]);

  useEffect(() => {
    if (!selectedArchiveMediaCount) {
      if (isArchiveSelectionMode) {
        setIsArchiveSelectionMode(false);
      }
      if (isBulkArchiveDeleteConfirmOpen) {
        setIsBulkArchiveDeleteConfirmOpen(false);
      }
      if (isAddToAlbumPickerOpen) {
        setIsAddToAlbumPickerOpen(false);
      }
    }
  }, [isAddToAlbumPickerOpen, isArchiveSelectionMode, isBulkArchiveDeleteConfirmOpen, selectedArchiveMediaCount]);

  useEffect(() => {
    if (!manualAlbums.length) {
      setBulkAddAlbumId("");
      return;
    }

    if (!bulkAddAlbumId || !manualAlbums.some((album) => album.id === bulkAddAlbumId)) {
      setBulkAddAlbumId(manualAlbums[0]?.id || "");
    }
  }, [bulkAddAlbumId, manualAlbums]);

  useEffect(() => {
    if (isArchiveSelectionMode && openArchiveActionsMediaId) {
      setOpenArchiveActionsMediaId(null);
      setOpenArchiveAlbumChooserMediaId(null);
    }
  }, [isArchiveSelectionMode, openArchiveActionsMediaId]);

  useEffect(() => {
    if (!openArchiveActionsMediaId && openArchiveAlbumChooserMediaId) {
      setOpenArchiveAlbumChooserMediaId(null);
    }
  }, [openArchiveActionsMediaId, openArchiveAlbumChooserMediaId]);

  useEffect(() => {
    if (
      openArchiveActionsMediaId &&
      !archiveMedia.some((asset) => asset.id === openArchiveActionsMediaId)
    ) {
      setOpenArchiveActionsMediaId(null);
      setOpenArchiveAlbumChooserMediaId(null);
    }
  }, [archiveMedia, openArchiveActionsMediaId]);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || !isArchiveSelectionMode || !selectedArchiveMediaCount) {
        return;
      }

      if (
        openArchiveActionsMediaId ||
        openArchiveAlbumChooserMediaId ||
        isAddToAlbumPickerOpen ||
        deleteTargetMediaId ||
        isBulkArchiveDeleteConfirmOpen ||
        isMediaViewerOpen ||
        isCreateAlbumOpen ||
        isUploadReviewOpen ||
        isDiscardConfirmOpen
      ) {
        return;
      }

      clearArchiveSelection();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    deleteTargetMediaId,
    isArchiveSelectionMode,
    isAddToAlbumPickerOpen,
    isBulkArchiveDeleteConfirmOpen,
    isCreateAlbumOpen,
    isDiscardConfirmOpen,
    isMediaViewerOpen,
    isUploadReviewOpen,
    openArchiveActionsMediaId,
    openArchiveAlbumChooserMediaId,
    selectedArchiveMediaCount,
  ]);
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
  const deleteTargetAsset = deleteTargetMediaId ? archiveMedia.find((asset) => asset.id === deleteTargetMediaId) || null : null;
  const canNavigateViewer = viewerMedia.length > 1;
  const pendingUploadsSummary = useMemo(() => buildPendingUploadSummary(pendingUploads), [pendingUploads]);
  const activeUploadCompletedCount = activeUploads.filter((item) => item.status === "done").length;
  const activeUploadPosition = activeUpload ? activeUploads.findIndex((item) => item.id === activeUpload.id) + 1 : 0;
  const activeUploadSummary =
    activeUploads.length > 1 && activeUpload
      ? `Файл ${activeUploadPosition} из ${activeUploads.length}. Готово ${activeUploadCompletedCount} из ${activeUploads.length}.`
      : activeUpload
        ? activeUpload.name
        : activeUploads.length
          ? `Готово ${activeUploadCompletedCount} из ${activeUploads.length}.`
          : null;

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

  function clearArchiveSelection() {
    setIsArchiveSelectionMode(false);
    setSelectedArchiveMediaIds(new Set());
    setIsBulkArchiveDeleteConfirmOpen(false);
    setIsAddToAlbumPickerOpen(false);
  }

  function toggleArchiveSelection(mediaId: string) {
    if (!canEdit) {
      return;
    }

    setSelectedArchiveMediaIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);
      if (nextSelection.has(mediaId)) {
        nextSelection.delete(mediaId);
      } else {
        nextSelection.add(mediaId);
      }
      return nextSelection;
    });
  }

  function startArchiveSelectionMode(mediaId: string) {
    if (!canEdit) {
      return;
    }

    setIsArchiveSelectionMode(true);
    setSelectedArchiveMediaIds((currentSelection) => new Set([...currentSelection, mediaId]));
  }

  function buildArchiveAlbumHrefForAlbum(asset: MediaAssetRecord, albumId: string) {
    const baseMode = asset.kind === "photo" ? "photo" : asset.kind === "video" ? "video" : "all";
    const params = new URLSearchParams({
      mode: baseMode,
      view: "albums",
    });
    params.set("album", albumId);
    return `/tree/${slug}/media?${params.toString()}`;
  }

  function getArchiveAlbumOptionsForAsset(asset: MediaAssetRecord): ArchiveAlbumOption[] {
    const optionsById = new Map<string, ArchiveAlbumOption>();

    for (const [albumId, items] of Object.entries(albumMediaMap)) {
      if (!items.some((item) => item.id === asset.id)) {
        continue;
      }

      const albumSummary = allAlbumSummaries.find((album) => album.id === albumId) || null;
      if (!albumSummary) {
        continue;
      }

      optionsById.set(albumId, {
        id: albumSummary.id,
        title: albumSummary.title,
        href: buildArchiveAlbumHrefForAlbum(asset, albumSummary.id),
      });
    }

    if (asset.created_by) {
      const uploaderAlbum =
        allAlbumSummaries.find((album) => album.id === `uploader-${asset.created_by}`) ||
        allAlbumSummaries.find((album) => album.albumKind === "uploader" && album.uploaderUserId === asset.created_by) ||
        null;

      if (uploaderAlbum) {
        optionsById.set(uploaderAlbum.id, {
          id: uploaderAlbum.id,
          title: uploaderAlbum.title,
          href: buildArchiveAlbumHrefForAlbum(asset, uploaderAlbum.id),
        });
      }
    }

    return [...optionsById.values()].sort((left, right) => left.title.localeCompare(right.title, "ru"));
  }

  function patchDeletedArchiveMedia(mediaIds: Iterable<string>) {
    const deletedMediaIds = new Set(mediaIds);
    if (!deletedMediaIds.size) {
      return;
    }

    setArchiveMedia((current) => current.filter((asset) => !deletedMediaIds.has(asset.id)));
    setAlbumMediaMap((current) =>
      Object.fromEntries(
        Object.entries(current).map(([albumId, items]) => [albumId, items.filter((asset) => !deletedMediaIds.has(asset.id))])
      )
    );
    setViewerMediaIds((current) => current.filter((mediaId) => !deletedMediaIds.has(mediaId)));
  }

  async function requestArchiveMediaDelete(mediaId: string) {
    return requestJson(`/api/media/${mediaId}`, "DELETE", {});
  }

  async function deleteSingleArchiveMedia() {
    if (!deleteTargetMediaId || isDeletingArchiveMedia) {
      return;
    }

    setStatus(null);
    setError(null);
    setIsDeletingArchiveMedia(true);

    try {
      const payload = await requestArchiveMediaDelete(deleteTargetMediaId);
      patchDeletedArchiveMedia([deleteTargetMediaId]);
      setDeleteTargetMediaId(null);
      setStatus(payload.message || "Медиа удалено.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить материал.");
    } finally {
      setIsDeletingArchiveMedia(false);
    }
  }

  async function deleteSelectedArchiveMedia() {
    const mediaIdsToDelete = [...selectedArchiveMediaIds];
    if (!mediaIdsToDelete.length || isDeletingArchiveMedia) {
      return;
    }

    setStatus(null);
    setError(null);
    setIsDeletingArchiveMedia(true);

    const deletedMediaIds: string[] = [];
    let firstErrorMessage: string | null = null;

    try {
      for (const mediaId of mediaIdsToDelete) {
        try {
          await requestArchiveMediaDelete(mediaId);
          deletedMediaIds.push(mediaId);
        } catch (deleteError) {
          if (!firstErrorMessage) {
            firstErrorMessage = deleteError instanceof Error ? deleteError.message : "Не удалось удалить выбранные материалы.";
          }
        }
      }

      if (deletedMediaIds.length) {
        patchDeletedArchiveMedia(deletedMediaIds);
      }

      clearArchiveSelection();

      if (deletedMediaIds.length === mediaIdsToDelete.length) {
        setStatus(`Удалено ${deletedMediaIds.length} ${deletedMediaIds.length === 1 ? "материал" : deletedMediaIds.length < 5 ? "материала" : "материалов"}.`);
      } else if (deletedMediaIds.length > 0) {
        setStatus(`Удалено ${deletedMediaIds.length} из ${mediaIdsToDelete.length} материалов.`);
      }

      if (firstErrorMessage) {
      setError(firstErrorMessage);
      }
    } finally {
      setIsDeletingArchiveMedia(false);
    }
  }

  async function addSelectedArchiveMediaToManualAlbum() {
    if (!canEdit || !bulkAddAlbumId || !selectedArchiveMediaCount || isAddingToAlbum) {
      return;
    }

    const targetAlbum = manualAlbums.find((album) => album.id === bulkAddAlbumId) || null;
    const existingMediaIds = new Set((albumMediaMap[bulkAddAlbumId] || []).map((asset) => asset.id));
    const mediaIdsToAdd = [...selectedArchiveMediaIds].filter((mediaId) => !existingMediaIds.has(mediaId));

    if (!mediaIdsToAdd.length) {
      clearArchiveSelection();
      setStatus(targetAlbum ? `Выбранные материалы уже есть в альбоме «${targetAlbum.title}».` : "Выбранные материалы уже есть в этом альбоме.");
      return;
    }

    setStatus(null);
    setError(null);
    setIsAddingToAlbum(true);

    try {
      const payload = await requestJson("/api/media/albums/items", "POST", {
        treeId,
        albumId: bulkAddAlbumId,
        mediaIds: mediaIdsToAdd,
      });

      const mediaById = new Map(archiveMedia.map((asset) => [asset.id, asset] as const));
      const nextAlbumMedia = mediaIdsToAdd
        .map((mediaId) => mediaById.get(mediaId) || null)
        .filter((asset): asset is MediaAssetRecord => Boolean(asset));

      setAlbumMediaMap((current) => {
        const currentAlbumMedia = current[bulkAddAlbumId] || [];
        const currentAlbumMediaIds = new Set(currentAlbumMedia.map((asset) => asset.id));
        const nextMedia = nextAlbumMedia.filter((asset) => !currentAlbumMediaIds.has(asset.id));

        return nextMedia.length
          ? {
              ...current,
              [bulkAddAlbumId]: [...nextMedia, ...currentAlbumMedia],
            }
          : current;
      });

      clearArchiveSelection();
      setStatus(payload.message || (payload.createdCount === 1 ? "Материал добавлен в альбом." : `Материалы добавлены в альбом: ${payload.createdCount}.`));
    } catch (albumError) {
      setError(albumError instanceof Error ? albumError.message : "Не удалось добавить материалы в альбом.");
    } finally {
      setIsAddingToAlbum(false);
    }
  }

  async function downloadSelectedArchiveMedia() {
    const mediaIdsToDownload = [...selectedArchiveMediaIds];
    if (!mediaIdsToDownload.length || isDownloadingArchiveMedia) {
      return;
    }

    setError(null);

    if (mediaIdsToDownload.length === 1) {
      const asset = archiveMedia.find((item) => item.id === mediaIdsToDownload[0]) || null;
      if (!asset) {
        setError("Не удалось подготовить файл для скачивания.");
        return;
      }

      window.location.assign(buildDownloadUrl(asset, shareToken));
      return;
    }

    setIsDownloadingArchiveMedia(true);

    try {
      const response = await fetch("/api/media/archive/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          treeId,
          mediaIds: mediaIdsToDownload
        })
      });
      const disposition = response.headers.get("Content-Disposition") || "";

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.error === "string" ? payload.error : "Не удалось подготовить архив для скачивания.");
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      anchor.href = downloadUrl;
      anchor.download = filenameMatch?.[1] || "archive-media.zip";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Не удалось подготовить архив для скачивания.");
    } finally {
      setIsDownloadingArchiveMedia(false);
    }
  }

  function renderArchiveTile(asset: MediaAssetRecord, items: MediaAssetRecord[]) {
    const imageUrl = asset.kind === "photo" && isHydrated ? buildPhotoUrl(asset, shareToken) : null;
    const downloadHref = buildDownloadUrl(asset, shareToken);
    const albumOptions = getArchiveAlbumOptionsForAsset(asset);
    const isSelected = selectedArchiveMediaIds.has(asset.id);
    const isActionsMenuOpen = openArchiveActionsMediaId === asset.id;
    const isAlbumChooserOpen = openArchiveAlbumChooserMediaId === asset.id;

    return (
      <div key={asset.id} className={`archive-tile-shell${isSelected ? " archive-tile-shell-selected" : ""}`}>
        {!isArchiveSelectionMode ? (
          <Popover
            open={isActionsMenuOpen}
            onOpenChange={(open) => {
              if (open) {
                setOpenArchiveActionsMediaId(asset.id);
                return;
              }

              if (openArchiveActionsMediaId === asset.id) {
                setOpenArchiveActionsMediaId(null);
              }
              if (openArchiveAlbumChooserMediaId === asset.id) {
                setOpenArchiveAlbumChooserMediaId(null);
              }
            }}
          >
            <PopoverTrigger className="archive-tile-actions-trigger" aria-label={`Открыть действия для «${asset.title}»`}>
              <MoreHorizontalIcon className="archive-tile-actions-trigger-icon" />
            </PopoverTrigger>
            <PopoverContent className="archive-card-actions-popover" align="end" side="bottom" sideOffset={8}>
              {isAlbumChooserOpen ? (
                <>
                  <button
                    type="button"
                    className="archive-card-menu-item"
                    onClick={() => setOpenArchiveAlbumChooserMediaId(null)}
                  >
                    Назад
                  </button>
                  {albumOptions.map((album) => (
                    <a
                      key={album.id}
                      href={album.href}
                      className="archive-card-menu-item"
                      onClick={() => {
                        setOpenArchiveActionsMediaId(null);
                        setOpenArchiveAlbumChooserMediaId(null);
                      }}
                    >
                      {album.title}
                    </a>
                  ))}
                </>
              ) : (
                <>
                  <a
                    href={downloadHref}
                    target="_blank"
                    rel="noreferrer"
                    className="archive-card-menu-item"
                    onClick={() => setOpenArchiveActionsMediaId(null)}
                  >
                    Скачать
                  </a>
                  {albumOptions.length === 1 ? (
                    <a
                      href={albumOptions[0].href}
                      className="archive-card-menu-item"
                      onClick={() => setOpenArchiveActionsMediaId(null)}
                    >
                      Перейти к альбому
                    </a>
                  ) : null}
                  {albumOptions.length > 1 ? (
                    <button
                      type="button"
                      className="archive-card-menu-item"
                      onClick={() => setOpenArchiveAlbumChooserMediaId(asset.id)}
                    >
                      Перейти в альбом…
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      className="archive-card-menu-item"
                      onClick={() => {
                        startArchiveSelectionMode(asset.id);
                        setOpenArchiveActionsMediaId(null);
                      }}
                    >
                      Выбрать несколько
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      className="archive-card-menu-item archive-card-menu-item-danger"
                      onClick={() => {
                        setDeleteTargetMediaId(asset.id);
                        setOpenArchiveActionsMediaId(null);
                      }}
                    >
                      Удалить
                    </button>
                  ) : null}
                </>
              )}
            </PopoverContent>
          </Popover>
        ) : (
          <label className="archive-tile-selector">
            <input
              type="checkbox"
              className="archive-tile-checkbox"
              checked={isSelected}
              aria-label={`Выбрать медиа ${asset.title}`}
              onChange={() => toggleArchiveSelection(asset.id)}
              onClick={(event) => event.stopPropagation()}
            />
            <span className="media-selection-indicator" aria-hidden="true">
              <span className="media-selection-checkmark">✓</span>
            </span>
          </label>
        )}
        <button
          type="button"
          className="archive-tile"
          aria-label={`${asset.kind === "photo" ? "Открыть фото" : asset.kind === "video" ? "Открыть видео" : "Открыть файл"}: ${asset.title}`}
          onClick={() => {
            if (isArchiveSelectionMode) {
              toggleArchiveSelection(asset.id);
              return;
            }
            openMediaViewer(asset.id, items);
          }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" className="archive-tile-image" />
          ) : (
            renderArchivePlaceholder(asset.kind)
          )}
        </button>
      </div>
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

  function openCreateAlbumDialog() {
    setAlbumTitle("Новый альбом");
    setAlbumDescription("");
    setIsCreateAlbumOpen(true);
  }

  async function ensureManagedAlbum(album: AlbumSummary) {
    const persisted = persistedAllAlbums.find((item) => item.id === album.id) || null;
    if (persisted) {
      return persisted;
    }

    if (album.albumKind !== "uploader" || !album.uploaderUserId) {
      return album;
    }

    const payload = await requestJson("/api/media/albums", "POST", {
      treeId,
      title: album.title,
      description: album.description || "",
      albumKind: "uploader",
      uploaderUserId: album.uploaderUserId
    });
    const created = payload.album as TreeMediaAlbumRecord;
    const summary: AlbumSummary = {
      id: created.id,
      title: created.title,
      description: created.description,
      albumKind: created.album_kind,
      uploaderUserId: created.uploader_user_id,
      count: album.count,
      coverMediaId: album.coverMediaId
    };

    setPersistedAllAlbums((current) => {
      const next = current.filter((item) => !(item.albumKind === "uploader" && item.uploaderUserId === summary.uploaderUserId));
      return [summary, ...next];
    });
    setDismissedUploaderAlbumUserIds((current) => {
      if (!summary.uploaderUserId) {
        return current;
      }
      const next = new Set(current);
      next.delete(summary.uploaderUserId);
      return next;
    });

    return summary;
  }

  async function openEditAlbumDialog(album: AlbumSummary) {
    try {
      const managedAlbum = await ensureManagedAlbum(album);
      setEditingAlbumId(managedAlbum.id);
      setEditAlbumTitle(managedAlbum.title);
      setEditAlbumDescription(managedAlbum.description || "");
      setOpenArchiveAlbumActionsId(null);
      setError(null);
    } catch (albumError) {
      setError(albumError instanceof Error ? albumError.message : "Не удалось подготовить альбом к редактированию.");
    }
  }

  async function openDeleteAlbumDialog(album: AlbumSummary) {
    try {
      const managedAlbum = await ensureManagedAlbum(album);
      setDeleteTargetAlbumId(managedAlbum.id);
      setOpenArchiveAlbumActionsId(null);
      setError(null);
    } catch (albumError) {
      setError(albumError instanceof Error ? albumError.message : "Не удалось подготовить альбом к удалению.");
    }
  }

  async function requestJson(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : {
        "Content-Type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
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
      const shouldResumeReview = resumeUploadReviewAfterAlbumCreate;
      if (shouldResumeReview) {
        setReviewAlbumId(album.id);
        setIsUploadReviewOpen(true);
        setResumeUploadReviewAfterAlbumCreate(false);
      } else {
        setView("albums");
        setSelectedAlbumId(album.id);
      }
      setIsCreateAlbumOpen(false);
      setStatus(payload.message || "Альбом создан.");
      setError(null);
    } catch (albumError) {
      setError(albumError instanceof Error ? albumError.message : "Не удалось создать альбом.");
    } finally {
      setIsCreatingAlbum(false);
    }
  }

  async function handleEditAlbum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingAlbum) {
      return;
    }

    try {
      setIsUpdatingAlbum(true);
      const payload = await requestJson(`/api/media/albums/${editingAlbum.id}`, "PATCH", {
        title: editAlbumTitle,
        description: editAlbumDescription
      });
      const album = payload.album as TreeMediaAlbumRecord;

      setPersistedAllAlbums((current) =>
        current.map((item) =>
          item.id === album.id
            ? {
                ...item,
                title: album.title,
                description: album.description,
              }
            : item
        )
      );
      setEditingAlbumId(null);
      setStatus(payload.message || "Альбом обновлен.");
      setError(null);
    } catch (albumError) {
      setError(albumError instanceof Error ? albumError.message : "Не удалось обновить альбом.");
    } finally {
      setIsUpdatingAlbum(false);
    }
  }

  async function deleteAlbum() {
    if (!deleteTargetAlbum) {
      return;
    }

    try {
      setIsDeletingAlbum(true);
      const payload = await requestJson(`/api/media/albums/${deleteTargetAlbum.id}`, "DELETE");

      setPersistedAllAlbums((current) => current.filter((item) => item.id !== deleteTargetAlbum.id));
      setAlbumMediaMap((current) => {
        const next = { ...current };
        delete next[deleteTargetAlbum.id];
        return next;
      });
      if (deleteTargetAlbum.albumKind === "uploader" && deleteTargetAlbum.uploaderUserId) {
        setDismissedUploaderAlbumUserIds((current) => {
          const next = new Set(current);
          next.add(deleteTargetAlbum.uploaderUserId as string);
          return next;
        });
      }
      if (selectedAlbumId === deleteTargetAlbum.id) {
        setSelectedAlbumId(null);
      }
      setDeleteTargetAlbumId(null);
      setStatus(payload.message || "Альбом удален.");
      setError(null);
    } catch (albumError) {
      setError(albumError instanceof Error ? albumError.message : "Не удалось удалить альбом.");
    } finally {
      setIsDeletingAlbum(false);
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

  function handleReviewAlbumChange(nextValue: string) {
    if (nextValue === CREATE_ALBUM_OPTION_VALUE) {
      setResumeUploadReviewAfterAlbumCreate(true);
      setIsUploadReviewOpen(false);
      openCreateAlbumDialog();
      return;
    }

    setReviewAlbumId(nextValue);
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
    description?: string | null;
    actions?: ReactNode;
  }) {
    return (
      <div className="empty-state archive-empty-state">
        <div className="empty-state-copy">
          <strong>{input.title}</strong>
          {input.description ? <p>{input.description}</p> : null}
        </div>
        {input.actions ? <div className="action-row empty-state-actions">{input.actions}</div> : null}
      </div>
    );
  }

  return (
    <Card className="archive-card p-6">
      <div className="archive-header">
        <div className="archive-header-copy">
          <p className="eyebrow">Семейный архив</p>
          <h2 className="card-heading">{modeLabel}</h2>
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
            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              {mode === "photo" ? "Загрузить фото" : mode === "video" ? "Загрузить видео" : "Загрузить файлы"}
            </Button>
            {!activeContextAlbum ? (
              <Button type="button" variant="secondary" onClick={openCreateAlbumDialog}>
                <PlusIcon />
                Создать альбом
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {activeUploads.length ? (
        <div className="archive-upload-panel">
          <div className="archive-upload-panel-copy">
            <strong>{activeUpload ? `Загрузка ${activeUpload.progressPercent}%` : "Загрузка завершена"}</strong>
            {activeUploadSummary ? <span>{activeUploadSummary}</span> : null}
            {activeUpload?.message ? <small>{activeUpload.message}</small> : null}
          </div>
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

      <Tabs value={mode} onValueChange={(value) => switchMode(value as MediaMode)}>
        <TabsList variant="line" aria-label="Режим архива">
          <TabsTrigger className={`pill-link${mode === "photo" ? " pill-link-active" : ""}`} value="photo">
            Фото
          </TabsTrigger>
          <TabsTrigger className={`pill-link${mode === "video" ? " pill-link-active" : ""}`} value="video">
            Видео
          </TabsTrigger>
          <TabsTrigger className={`pill-link${mode === "all" ? " pill-link-active" : ""}`} value="all">
            Все медиа
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs value={view} onValueChange={(value) => switchView(value as ArchiveView)}>
        <TabsList variant="line" aria-label="Режим просмотра архива">
          <TabsTrigger className={`pill-link${view === "all" ? " pill-link-active" : ""}`} value="all">
            Все
          </TabsTrigger>
          <TabsTrigger
            className={`pill-link${view === "albums" ? " pill-link-active" : ""}`}
            value="albums"
            onClick={() => {
              if (view === "albums" && selectedAlbumId) {
                setSelectedAlbumId(null);
              }
            }}
          >
            Альбомы
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {canEdit && isArchiveSelectionMode && selectedArchiveMediaCount ? (
        <div className="archive-selection-bar" role="region" aria-label="Действия с выбранными материалами">
          <div className="archive-selection-copy">
            <strong className="archive-selection-count">Выбрано: {selectedArchiveMediaCount}</strong>
          </div>
          <div className="archive-action-bar archive-selection-actions">
            <Popover open={isAddToAlbumPickerOpen} onOpenChange={setIsAddToAlbumPickerOpen}>
              <PopoverTrigger
                render={
                  <Button type="button" className="archive-selection-action archive-selection-action-primary" disabled={isDeletingArchiveMedia || isAddingToAlbum || !manualAlbums.length} />
                }
              >
                Добавить в альбом
              </PopoverTrigger>
              <PopoverContent className="archive-bulk-album-popover" align="end" side="bottom" sideOffset={9}>
                <div className="archive-bulk-album-popover-copy">
                  <strong>Добавить в альбом</strong>
                  <span>Выберите альбом</span>
                </div>
                <label className="form-field archive-field">
                  Альбом
                  <SelectField value={bulkAddAlbumId} onChange={(event) => setBulkAddAlbumId(event.target.value)} disabled={isAddingToAlbum}>
                    {manualAlbums.map((album) => (
                      <option key={album.id} value={album.id}>
                        {album.title}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <div className="archive-action-bar archive-bulk-album-actions">
                  <Button type="button" variant="ghost" className="archive-selection-action-cancel" disabled={isAddingToAlbum} onClick={() => setIsAddToAlbumPickerOpen(false)}>
                    Отмена
                  </Button>
                  <Button type="button" className="archive-selection-action-primary" disabled={isAddingToAlbum || !bulkAddAlbumId} onClick={() => void addSelectedArchiveMediaToManualAlbum()}>
                    {isAddingToAlbum ? "Добавляю..." : "Добавить"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              className="archive-selection-action archive-selection-action-secondary archive-selection-action-download"
              disabled={isDeletingArchiveMedia || isAddingToAlbum || isDownloadingArchiveMedia}
              onClick={() => void downloadSelectedArchiveMedia()}
            >
              {isDownloadingArchiveMedia ? "Скачиваю..." : "Скачать"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="archive-selection-action archive-selection-action-destructive"
              disabled={isDeletingArchiveMedia || isAddingToAlbum}
              onClick={() => setIsBulkArchiveDeleteConfirmOpen(true)}
            >
              {isDeletingArchiveMedia ? "Удаляю..." : "Удалить"}
            </Button>
            <Button type="button" variant="ghost" className="archive-selection-action archive-selection-action-cancel" disabled={isDeletingArchiveMedia || isAddingToAlbum} onClick={clearArchiveSelection}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {view === "all" ? (
        currentMedia.length ? (
          <>
            <div className="archive-grid">
              {visibleMedia.map((asset) => renderArchiveTile(asset, currentMedia))}
            </div>

            {visibleItems < currentMedia.length ? (
              <div className="action-row archive-actions">
                <Button type="button" variant="ghost" onClick={() => setVisibleItems((current) => current + INITIAL_TILE_LIMIT)}>
                  Показать еще
                </Button>
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
              ? "Добавьте первые файлы или сразу создайте альбом под семейную подборку."
              : "Когда материалы появятся, они соберутся здесь в спокойной галерее.",
            actions: canEdit ? (
              <>
                <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                  {mode === "photo" ? "Загрузить фото" : mode === "video" ? "Загрузить видео" : "Загрузить файлы"}
                </Button>
                <Button type="button" variant="secondary" onClick={openCreateAlbumDialog}>
                  <PlusIcon />
                  Создать альбом
                </Button>
              </>
            ) : null
          })
        )
      ) : selectedAlbum ? (
        <>
          <div className="archive-subheader">
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
              title: mode === "photo" ? "В этом альбоме пока нет фото" : mode === "video" ? "В этом альбоме пока нет видео" : "В этом альбоме пока нет медиа",
              actions: canEdit ? (
                <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                  {mode === "photo" ? "Загрузить фото" : mode === "video" ? "Загрузить видео" : "Загрузить файлы"}
                </Button>
              ) : null
            })
          )}
        </>
      ) : currentAlbums.length ? (
        <div className="archive-album-grid">
          {currentAlbums.map((album) => {
            const coverUrl = isHydrated ? buildAlbumCoverUrl(album.coverMediaId, allMedia, shareToken) : null;
            const isAlbumActionsOpen = openArchiveAlbumActionsId === album.id;

            return (
              <div key={album.id} className="archive-album-card-shell">
                <div
                  className="archive-album-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedAlbumId(album.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedAlbumId(album.id);
                    }
                  }}
                >
                  <div className="archive-album-cover">
                    {canEdit ? (
                      <Popover
                        open={isAlbumActionsOpen}
                        onOpenChange={(open) => {
                          setOpenArchiveAlbumActionsId(open ? album.id : null);
                        }}
                      >
                        <PopoverTrigger
                          className="archive-album-actions-trigger"
                          aria-label={`Открыть действия для альбома «${album.title}»`}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontalIcon className="archive-tile-actions-trigger-icon" />
                        </PopoverTrigger>
                        <PopoverContent className="archive-card-actions-popover" align="end" side="bottom" sideOffset={8}>
                          <button
                            type="button"
                            className="archive-card-menu-item"
                            onClick={() => void openEditAlbumDialog(album)}
                          >
                            Редактировать
                          </button>
                          <button
                            type="button"
                            className="archive-card-menu-item archive-card-menu-item-danger"
                            onClick={() => void openDeleteAlbumDialog(album)}
                          >
                            Удалить
                          </button>
                        </PopoverContent>
                      </Popover>
                    ) : null}
                    {coverUrl ? (
                      <img src={coverUrl} alt="" loading="lazy" className="archive-album-image" />
                    ) : (
                      renderArchivePlaceholder(mode === "video" ? "video" : "photo")
                    )}
                  </div>
                  <div className="archive-album-copy">
                    <strong>{album.title}</strong>
                    <span>{album.count} {mode === "all" ? "материалов" : itemLabel}</span>
                    <small>{album.description?.trim() || (album.albumKind === "uploader" ? "Автоальбом загрузившего" : "Пользовательский альбом")}</small>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        renderArchiveEmptyState({
          title: "Альбомов для этого раздела пока нет",
          description: canEdit
            ? "Создайте первый альбом для поездки, праздника или другой общей серии."
            : "Когда владелец или редактор соберет альбомы, они появятся здесь.",
          actions: canEdit ? (
            <Button type="button" variant="secondary" onClick={openCreateAlbumDialog}>
              <PlusIcon />
              Создать альбом
            </Button>
          ) : null
        })
      )}

      {!activeContextAlbum && view === "all" && visibleItems < currentMedia.length ? (
        <div className="archive-sticky-footer">
          <div className="archive-sticky-copy">
            <strong>{modeLabel}</strong>
            <span>{`${currentMedia.length} ${mode === "all" ? "материалов" : itemLabel} в текущем режиме`}</span>
          </div>
          <div className="archive-action-bar">
            <Button type="button" variant="ghost" onClick={() => setVisibleItems((current) => current + INITIAL_TILE_LIMIT)}>
              Показать еще
            </Button>
          </div>
        </div>
      ) : null}

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
                <a href={buildOpenUrl(activeViewerAsset, shareToken)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost" })}>
                  {getArchiveOpenLabel(activeViewerAsset)}
                </a>
                <Button type="button" variant="ghost" onClick={() => setIsMediaViewerOpen(false)}>
                  Закрыть
                </Button>
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
                    <a href={buildOpenUrl(activeViewerAsset, shareToken)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost" })}>
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
                        renderArchivePlaceholder(asset.kind)
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <Dialog
        open={Boolean(editingAlbumId)}
        onOpenChange={(open) => {
          if (!open && !isUpdatingAlbum) {
            setEditingAlbumId(null);
          }
        }}
      >
        <DialogContent className="archive-dialog" aria-label="Редактировать альбом" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Редактировать альбом</DialogTitle>
            <DialogDescription>
              Обновите название и описание альбома.
            </DialogDescription>
          </DialogHeader>
          <form className="stack-form archive-album-form" onSubmit={handleEditAlbum}>
            <label className="form-field">
              Название
              <Input value={editAlbumTitle} onChange={(event) => setEditAlbumTitle(event.target.value)} required maxLength={120} />
            </label>
            <label className="form-field">
              Описание
              <Textarea value={editAlbumDescription} onChange={(event) => setEditAlbumDescription(event.target.value)} rows={4} maxLength={512} />
            </label>
            <DialogFooter className="archive-actions">
              <Button type="button" variant="ghost" disabled={isUpdatingAlbum} onClick={() => setEditingAlbumId(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={isUpdatingAlbum}>
                {isUpdatingAlbum ? "Сохраняю..." : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTargetAlbumId)}
        onOpenChange={(open) => {
          if (!open && !isDeletingAlbum) {
            setDeleteTargetAlbumId(null);
          }
        }}
      >
        <DialogContent className="archive-confirm-dialog" aria-label="Удалить альбом?" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Удалить альбом?</DialogTitle>
            <DialogDescription>
              {deleteTargetAlbum
                ? `Альбом «${deleteTargetAlbum.title}» будет удален. Файлы и видео останутся в семейном архиве.`
                : "Альбом будет удален. Файлы и видео останутся в семейном архиве."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="archive-actions">
            <Button type="button" variant="ghost" disabled={isDeletingAlbum} onClick={() => setDeleteTargetAlbumId(null)}>
              Отмена
            </Button>
            <Button type="button" variant="destructive" disabled={isDeletingAlbum} onClick={() => void deleteAlbum()}>
              {isDeletingAlbum ? "Удаляю..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateAlbumOpen}
        onOpenChange={(open) => {
          setIsCreateAlbumOpen(open);
          if (!open && resumeUploadReviewAfterAlbumCreate && pendingUploads.length && !isCreatingAlbum) {
            setIsUploadReviewOpen(true);
            setResumeUploadReviewAfterAlbumCreate(false);
          }
        }}
      >
        <DialogContent className="archive-dialog" aria-label="Создать альбом" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Создать альбом</DialogTitle>
            <DialogDescription>
              Сюда можно будет складывать отдельные семейные подборки: свадьбы, дни рождения, поездки и другие общие архивы.
            </DialogDescription>
          </DialogHeader>
          <form className="stack-form archive-album-form" onSubmit={handleCreateAlbum}>
            <label className="form-field">
              Название
              <Input value={albumTitle} onChange={(event) => setAlbumTitle(event.target.value)} required maxLength={120} />
            </label>
            <label className="form-field">
              Описание
              <Textarea value={albumDescription} onChange={(event) => setAlbumDescription(event.target.value)} rows={4} maxLength={512} />
            </label>
            <DialogFooter className="archive-actions">
              <Button type="button" variant="ghost" disabled={isCreatingAlbum} onClick={() => setIsCreateAlbumOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={isCreatingAlbum}>
                {isCreatingAlbum ? "Создаю альбом..." : "Создать альбом"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isUploadReviewOpen} onOpenChange={(open) => (!open ? closeUploadReview() : null)}>
        <DialogContent className="archive-dialog" aria-label="Подготовка загрузки" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Подготовка загрузки</DialogTitle>
            <DialogDescription>
              {reviewTargetAlbum
                ? `Новые материалы попадут в альбом «${reviewTargetAlbum.title}».`
                : "Выберите, что именно сохранить в семейный архив."}
            </DialogDescription>
          </DialogHeader>
          <div className="archive-review-layout">
            <div className="archive-review-summary" aria-label="Сводка выбранных файлов">
              {pendingUploadsSummary}
            </div>
            {selectedAlbum?.albumKind !== "manual" ? (
              <label className="form-field archive-field archive-review-field-span">
                Куда сохранить (можно выбрать альбом)
                <SelectField value={reviewAlbumId} onChange={(event) => handleReviewAlbumChange(event.target.value)}>
                  <option value="">Только в общий архив</option>
                  {manualAlbums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.title}
                    </option>
                  ))}
                  <option value={CREATE_ALBUM_OPTION_VALUE}>+ Создать альбом</option>
                </SelectField>
              </label>
            ) : null}
            <div className="archive-review-metadata">
              <label className="form-field archive-field">
                Видимость
                <SelectField value={reviewVisibility} onChange={(event) => setReviewVisibility(event.target.value as "public" | "members")}>
                  <option value="members">Только членам семьи</option>
                  <option value="public">Всем по ссылке</option>
                </SelectField>
              </label>
              <label className="form-field archive-field">
                Подпись
                <Textarea
                  rows={1}
                  className="min-h-11"
                  value={reviewCaption}
                  onChange={(event) => setReviewCaption(event.target.value)}
                  placeholder="Общая подпись для выбранных файлов, если она нужна"
                />
              </label>
            </div>
            <div className="archive-review-body">
              <div className={`archive-grid archive-review-grid${pendingUploads.length > 12 ? " archive-review-grid-dense" : ""}`}>
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
                      renderArchivePlaceholder(item.file.type.startsWith("video/") ? "video" : "file")
                    )}
                    <div className="archive-review-tile-copy">
                      <strong title={item.file.name}>{item.file.name}</strong>
                      <span>{getArchiveUploadItemKindLabel(item.file)} • {formatArchiveFileSize(item.file.size)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="archive-review-footer archive-actions">
            <input
              ref={reviewFileInputRef}
              className="builder-native-file-input"
              type="file"
              multiple
              accept={mode === "photo" ? "image/*" : mode === "video" ? "video/*" : "image/*,video/*,.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx"}
              onChange={handleArchiveFileSelection}
            />
            <Button type="button" variant="secondary" onClick={() => reviewFileInputRef.current?.click()}>
              Добавить еще
            </Button>
            <Button type="button" variant="outline" onClick={closeUploadReview}>
              Отмена
            </Button>
            <Button type="button" disabled={isSavingUploads} onClick={() => void savePendingUploads()}>
              {isSavingUploads ? "Сохраняем..." : `Сохранить ${pendingUploads.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDiscardConfirmOpen} onOpenChange={setIsDiscardConfirmOpen}>
        <DialogContent className="archive-confirm-dialog" aria-label="Закрыть окно загрузки" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Закрыть окно загрузки?</DialogTitle>
            <DialogDescription>Некоторые выбранные файлы еще не сохранены. Если закрыть окно сейчас, этот набор пропадет.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="archive-actions">
            <Button type="button" variant="ghost" onClick={() => setIsDiscardConfirmOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={discardPendingUploads}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTargetMediaId)}
        onOpenChange={(open) => {
          if (!open && !isDeletingArchiveMedia) {
            setDeleteTargetMediaId(null);
          }
        }}
      >
        <DialogContent className="archive-confirm-dialog" aria-label="Удалить этот материал?" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {deleteTargetAsset?.kind === "photo"
                ? "Удалить это фото?"
                : deleteTargetAsset?.kind === "video"
                  ? "Удалить это видео?"
                  : "Удалить этот материал?"}
            </DialogTitle>
            <DialogDescription>
              {deleteTargetAsset?.kind === "photo"
                ? deleteTargetAsset
                  ? `Фото «${deleteTargetAsset.title}» будет удалено.`
                  : "Фото будет удалено."
                : deleteTargetAsset
                  ? `Материал «${deleteTargetAsset.title}» будет удален.`
                  : "Материал будет удален."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="archive-actions">
            <Button type="button" variant="ghost" disabled={isDeletingArchiveMedia} onClick={() => setDeleteTargetMediaId(null)}>
              Отмена
            </Button>
            <Button type="button" disabled={isDeletingArchiveMedia} onClick={() => void deleteSingleArchiveMedia()}>
              {isDeletingArchiveMedia ? "Удаляю..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isBulkArchiveDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isDeletingArchiveMedia) {
            setIsBulkArchiveDeleteConfirmOpen(false);
          }
        }}
      >
        <DialogContent className="archive-confirm-dialog" aria-label="Удалить выбранные фото?" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Удалить выбранные фото?</DialogTitle>
            <DialogDescription>
              {selectedArchiveMediaCount ? `${selectedArchiveMediaCount} фото будут удалены.` : "Выбранные фото будут удалены."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="archive-actions">
            <Button type="button" variant="ghost" disabled={isDeletingArchiveMedia} onClick={() => setIsBulkArchiveDeleteConfirmOpen(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={isDeletingArchiveMedia} onClick={() => void deleteSelectedArchiveMedia()}>
              {isDeletingArchiveMedia ? "Удаляю..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {status ? (
        <div className="builder-status-toast" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
    </Card>
  );
}
