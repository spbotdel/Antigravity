"use client";

import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaThumbVisual } from "@/components/media/media-thumb-visual";
import { PersonMediaGallery } from "@/components/tree/person-media-gallery";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectField } from "@/components/ui/select-field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { buildDerivedUploaderAlbumSummaries, buildTreeMediaAlbumSummaries, buildUploaderAlbumSyntheticId, resolveMediaThumbSource, type MediaThumbSource } from "@/lib/tree/display";
import { uploadFileWithTransportContract } from "@/lib/utils";
import type { MediaAssetRecord, MediaUploadTargetResponse, TreeMediaAlbumMediaKind, TreeMediaAlbumRecord } from "@/lib/types";
import { AudioArchiveView } from "@/components/media/audio-archive-view";
import { DocumentArchiveView } from "@/components/media/document-archive-view";
import { LockIcon, MoreHorizontalIcon, PlayIcon, PlusIcon } from "lucide-react";

type MediaMode = "photo" | "video" | "audio" | "document" | "all";
type ArchiveView = "all" | "albums";

declare global {
  interface Window {
    __archiveThumbPerf?: {
      events: Array<Record<string, unknown>>;
    };
  }
}

interface AlbumSummary {
  id: string;
  title: string;
  description: string | null;
  kind: TreeMediaAlbumRecord["kind"] | "all";
  access: TreeMediaAlbumRecord["access"];
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
  initialThumbUrlsByMediaId?: Record<string, string>;
  uploaderLabels: Array<{ userId: string; label: string }>;
}

interface ArchiveAlbumOption {
  id: string;
  title: string;
  href: string;
}

type ArchiveTileScope = "grid" | "album";

interface ArchiveViewerSession {
  mediaIds: string[];
  initialMediaId: string;
}

const INITIAL_TILE_LIMIT = 18;
const MAX_PHOTO_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_DEFAULT_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MEDIA_THUMB_BATCH_REQUEST_LIMIT = 100;
const ARCHIVE_THUMB_PREFETCH_IDLE_DELAY_MS = 600;
const CREATE_ALBUM_OPTION_VALUE = "__create_album__";
const ARCHIVE_VIEWER_WINDOW_LIMIT = INITIAL_TILE_LIMIT;
const ARCHIVE_THUMB_PERF_ENABLED = process.env.NODE_ENV === "development";

function recordArchiveThumbPerfEvent(event: Record<string, unknown>) {
  if (!ARCHIVE_THUMB_PERF_ENABLED || typeof window === "undefined" || typeof performance === "undefined") {
    return;
  }

  if (!window.__archiveThumbPerf) {
    window.__archiveThumbPerf = {
      events: [],
    };
  }

  window.__archiveThumbPerf.events.push({
    at: performance.now(),
    ...event,
  });

  if (window.__archiveThumbPerf.events.length > 1000) {
    window.__archiveThumbPerf.events.splice(0, window.__archiveThumbPerf.events.length - 1000);
  }
}

function parseServerTimingDuration(serverTimingHeader: string | null, metricName: string) {
  if (!serverTimingHeader) {
    return null;
  }

  const matchedMetric = serverTimingHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${metricName};dur=`));

  if (!matchedMetric) {
    return null;
  }

  const rawDuration = matchedMetric.split("dur=")[1];
  const parsedDuration = Number(rawDuration);
  return Number.isFinite(parsedDuration) ? parsedDuration : null;
}

function scheduleArchiveThumbIdleCallback(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(() => callback(), { timeout: 1200 });
    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(handle);
      }
    };
  }

  const timeoutId = window.setTimeout(callback, ARCHIVE_THUMB_PREFETCH_IDLE_DELAY_MS);
  return () => window.clearTimeout(timeoutId);
}

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

function getAlbumCompatibleKindForFile(file: File): TreeMediaAlbumMediaKind | null {
  if (file.type.startsWith("image/")) {
    return "photo";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  return null;
}

function getAlbumCompatibleKindForAsset(asset: MediaAssetRecord): TreeMediaAlbumMediaKind | null {
  return asset.kind === "photo" || asset.kind === "video" ? asset.kind : null;
}

function resolveSingleAlbumKind(kinds: Array<TreeMediaAlbumMediaKind | null>): TreeMediaAlbumMediaKind | null {
  const uniqueKinds = [...new Set(kinds.filter((value): value is TreeMediaAlbumMediaKind => Boolean(value)))];
  return uniqueKinds.length === 1 ? uniqueKinds[0] : null;
}

function getUploaderAlbumSummaryKey(album: Pick<AlbumSummary, "uploaderUserId" | "kind">) {
  return album.uploaderUserId ? `${album.uploaderUserId}:${album.kind}` : null;
}

function mergeUploaderAlbumsForAllMedia(albums: AlbumSummary[], media: MediaAssetRecord[]) {
  const merged = new Map<string, AlbumSummary>();
  const ordered: AlbumSummary[] = [];

  for (const album of albums) {
    if (album.albumKind !== "uploader" || !album.uploaderUserId) {
      ordered.push(album);
      continue;
    }

    const existing = merged.get(album.uploaderUserId);
    if (existing) {
      const uploaderMedia = media.filter((asset) => asset.created_by === album.uploaderUserId && (asset.kind === "photo" || asset.kind === "video"));
      const cover =
        uploaderMedia.find((asset) => asset.kind === "photo") ||
        uploaderMedia[0] ||
        null;

      existing.count = uploaderMedia.length;
      existing.coverMediaId = cover?.id || null;
      continue;
    }

    const uploaderMedia = media.filter((asset) => asset.created_by === album.uploaderUserId && (asset.kind === "photo" || asset.kind === "video"));
    const cover =
      uploaderMedia.find((asset) => asset.kind === "photo") ||
      uploaderMedia[0] ||
      null;

    const nextAlbum: AlbumSummary = {
      ...album,
      kind: "all",
      count: uploaderMedia.length,
      coverMediaId: cover?.id || null,
    };
    merged.set(album.uploaderUserId, nextAlbum);
    ordered.push(nextAlbum);
  }

  return ordered;
}

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

function formatCountWithRussianPlural(count: number, forms: { one: string; few: string; many: string }) {
  const absolute = Math.abs(count) % 100;
  const lastDigit = absolute % 10;

  if (absolute >= 11 && absolute <= 14) {
    return `${count} ${forms.many}`;
  }

  if (lastDigit === 1) {
    return `${count} ${forms.one}`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} ${forms.few}`;
  }

  return `${count} ${forms.many}`;
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

interface AlbumPreviewItem {
  asset: MediaAssetRecord;
  thumbSource: Exclude<MediaThumbSource, null>;
}

const ARCHIVE_ALBUM_LAYOUT_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  display: "grid",
  gap: "3px",
  overflow: "hidden",
  isolation: "isolate",
};

const ARCHIVE_ALBUM_LAYOUT_TWO_STYLE: CSSProperties = {
  ...ARCHIVE_ALBUM_LAYOUT_STYLE,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const ARCHIVE_ALBUM_LAYOUT_THREE_STYLE: CSSProperties = {
  ...ARCHIVE_ALBUM_LAYOUT_STYLE,
  gridTemplateColumns: "minmax(0, 2.35fr) minmax(0, 1fr)",
};

const ARCHIVE_ALBUM_PREVIEW_COLUMN_STYLE: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "3px",
  gridTemplateRows: "repeat(2, minmax(0, 1fr))",
};

const ARCHIVE_ALBUM_PREVIEW_TILE_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  background: "rgba(18, 27, 43, 0.06)",
};

const ARCHIVE_ALBUM_PREVIEW_MEDIA_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  aspectRatio: "auto",
  objectFit: "cover",
  display: "block",
  borderRadius: 0,
};

const ARCHIVE_ALBUM_PREVIEW_MEDIA_SECONDARY_STYLE: CSSProperties = {
  ...ARCHIVE_ALBUM_PREVIEW_MEDIA_STYLE,
  opacity: 0.94,
  filter: "saturate(0.88) brightness(0.97)",
};

const ARCHIVE_ALBUM_PREVIEW_OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background: "linear-gradient(180deg, rgba(18, 27, 43, 0) 40%, rgba(18, 27, 43, 0.08) 100%)",
  zIndex: 1,
};

function buildPersistedArchiveAlbumSummaries(input: {
  albums: AlbumSummary[];
  media: MediaAssetRecord[];
  albumMediaMap: Record<string, MediaAssetRecord[]>;
  kind?: Extract<MediaMode, "photo" | "video">;
}) {
  return input.albums
    .filter((album) => !input.kind || album.kind === input.kind)
    .map((album) => {
      const albumAllMedia =
        album.albumKind === "uploader" && album.uploaderUserId
          ? input.media.filter((asset) => asset.created_by === album.uploaderUserId && asset.kind === album.kind)
          : (input.albumMediaMap[album.id] || []).filter((asset) => asset.kind === album.kind);
      const albumMedia = albumAllMedia.filter((asset) => asset.kind === album.kind);
      const cover =
        albumMedia.find((asset) => asset.kind === "photo") ||
        albumMedia[0] ||
        null;

      return {
        ...album,
        count: albumMedia.length,
        coverMediaId: cover?.id || null,
      };
    })
    .filter(Boolean) as AlbumSummary[];
}

function getArchiveAlbumSourceMedia(
  album: Pick<AlbumSummary, "id" | "kind" | "albumKind" | "uploaderUserId">,
  currentMedia: MediaAssetRecord[],
  currentAlbumMediaMap: Record<string, MediaAssetRecord[]>
) {
  if (album.albumKind === "uploader" && album.uploaderUserId) {
    return currentMedia.filter((asset) =>
      asset.created_by === album.uploaderUserId &&
      (album.kind === "all" ? asset.kind === "photo" || asset.kind === "video" : asset.kind === album.kind)
    );
  }

  return (currentAlbumMediaMap[album.id] || []).filter((asset) =>
    album.kind === "all" ? asset.kind === "photo" || asset.kind === "video" : asset.kind === album.kind
  );
}

function formatArchiveAlbumContentLabel(
  album: Pick<AlbumSummary, "kind" | "count">,
  albumMedia: MediaAssetRecord[]
) {
  let photoCount = 0;
  let videoCount = 0;

  for (const asset of albumMedia) {
    if (asset.kind === "photo") {
      photoCount += 1;
    } else if (asset.kind === "video") {
      videoCount += 1;
    }
  }

  if (photoCount || videoCount) {
    const parts: string[] = [];

    if (photoCount) {
      parts.push(`${photoCount} фото`);
    }

    if (videoCount) {
      parts.push(`${videoCount} видео`);
    }

    return parts.join(" · ");
  }

  if (album.kind === "photo") {
    return `${album.count} фото`;
  }

  if (album.kind === "video") {
    return `${album.count} видео`;
  }

  return formatCountWithRussianPlural(album.count, {
    one: "элемент",
    few: "элемента",
    many: "элементов",
  });
}

function hasArchiveAlbumVideoIndicator(
  album: Pick<AlbumSummary, "kind" | "count">,
  albumMedia: MediaAssetRecord[]
) {
  let photoCount = 0;
  let videoCount = 0;

  for (const asset of albumMedia) {
    if (asset.kind === "photo") {
      photoCount += 1;
    } else if (asset.kind === "video") {
      videoCount += 1;
    }
  }

  return videoCount > 0 || (album.kind === "video" && album.count === 0);
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

function renderArchivePlaceholder(kind: MediaAssetRecord["kind"] | "file") {
  const isVideo = kind === "video";

  return (
    <div className={`archive-tile-placeholder${isVideo ? " archive-tile-placeholder-video" : ""}`}>
      <span className={`archive-tile-placeholder-mark${isVideo ? " archive-tile-placeholder-mark-video" : ""}`} aria-hidden="true" />
    </div>
  );
}

interface ArchiveTileProps {
  asset: MediaAssetRecord;
  scope: ArchiveTileScope;
  thumbSource: MediaThumbSource;
  downloadHref: string;
  albumOptions: ArchiveAlbumOption[];
  isSelected: boolean;
  isArchiveSelectionMode: boolean;
  isActionsMenuOpen: boolean;
  isAlbumChooserOpen: boolean;
  canEdit: boolean;
  onToggleSelection: (mediaId: string) => void;
  onOpen: (mediaId: string, scope: ArchiveTileScope) => void;
  onActionsMenuOpenChange: (mediaId: string, open: boolean) => void;
  onAlbumChooserOpen: (mediaId: string) => void;
  onStartSelection: (mediaId: string) => void;
  onDelete: (mediaId: string) => void;
  onRender: (mediaId: string) => void;
}

function areArchiveAlbumOptionsEqual(left: ArchiveAlbumOption[], right: ArchiveAlbumOption[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((option, index) => {
    const other = right[index];
    return option.id === other?.id && option.title === other.title && option.href === other.href;
  });
}

const ArchiveTile = memo(function ArchiveTile({
  asset,
  scope,
  thumbSource,
  downloadHref,
  albumOptions,
  isSelected,
  isArchiveSelectionMode,
  isActionsMenuOpen,
  isAlbumChooserOpen,
  canEdit,
  onToggleSelection,
  onOpen,
  onActionsMenuOpenChange,
  onAlbumChooserOpen,
  onStartSelection,
  onDelete,
  onRender,
}: ArchiveTileProps) {
  onRender(asset.id);

  return (
    <div className={`archive-tile-shell${isSelected ? " archive-tile-shell-selected" : ""}`}>
      {!isArchiveSelectionMode ? (
        <Popover
          open={isActionsMenuOpen}
          onOpenChange={(open) => {
            onActionsMenuOpenChange(asset.id, open);
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
                  onClick={() => onAlbumChooserOpen("")}
                >
                  Назад
                </button>
                {albumOptions.map((album) => (
                  <a
                    key={album.id}
                    href={album.href}
                    className="archive-card-menu-item"
                    onClick={() => {
                      onActionsMenuOpenChange(asset.id, false);
                      onAlbumChooserOpen("");
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
                  onClick={() => onActionsMenuOpenChange(asset.id, false)}
                >
                  Скачать
                </a>
                {albumOptions.length === 1 ? (
                  <a
                    href={albumOptions[0].href}
                    className="archive-card-menu-item"
                    onClick={() => onActionsMenuOpenChange(asset.id, false)}
                  >
                    Перейти к альбому
                  </a>
                ) : null}
                {albumOptions.length > 1 ? (
                  <button
                    type="button"
                    className="archive-card-menu-item"
                    onClick={() => onAlbumChooserOpen(asset.id)}
                  >
                    Перейти в альбом…
                  </button>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    className="archive-card-menu-item"
                    onClick={() => {
                      onStartSelection(asset.id);
                      onActionsMenuOpenChange(asset.id, false);
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
                      onDelete(asset.id);
                      onActionsMenuOpenChange(asset.id, false);
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
            onChange={() => onToggleSelection(asset.id)}
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
        data-archive-thumb-media-id={asset.id}
        aria-label={`${asset.kind === "photo" ? "Открыть фото" : asset.kind === "video" ? "Открыть видео" : "Открыть файл"}: ${asset.title}`}
        onClick={() => {
          if (isArchiveSelectionMode) {
            onToggleSelection(asset.id);
            return;
          }
          onOpen(asset.id, scope);
        }}
      >
        {thumbSource ? (
          <MediaThumbVisual
            asset={asset}
            thumbSource={thumbSource}
            containerClassName="archive-thumb-visual"
            mediaClassName={thumbSource.kind === "image" ? "archive-tile-image" : "archive-tile-video"}
            placeholder={null}
            disableDurationProbe
          />
        ) : (
          renderArchivePlaceholder(asset.kind)
        )}
      </button>
    </div>
  );
}, (prevProps, nextProps) => (
  prevProps.asset.id === nextProps.asset.id &&
  prevProps.asset.title === nextProps.asset.title &&
  prevProps.asset.kind === nextProps.asset.kind &&
  prevProps.scope === nextProps.scope &&
  prevProps.downloadHref === nextProps.downloadHref &&
  prevProps.thumbSource?.kind === nextProps.thumbSource?.kind &&
  prevProps.thumbSource?.src === nextProps.thumbSource?.src &&
  prevProps.isSelected === nextProps.isSelected &&
  prevProps.isArchiveSelectionMode === nextProps.isArchiveSelectionMode &&
  prevProps.isActionsMenuOpen === nextProps.isActionsMenuOpen &&
  prevProps.isAlbumChooserOpen === nextProps.isAlbumChooserOpen &&
  prevProps.canEdit === nextProps.canEdit &&
  areArchiveAlbumOptionsEqual(prevProps.albumOptions, nextProps.albumOptions)
));

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
  initialThumbUrlsByMediaId = {},
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
  const [createAlbumAccess, setCreateAlbumAccess] = useState<"public" | "members">("members");
  const [editAlbumAccess, setEditAlbumAccess] = useState<"public" | "members">("members");
  const [isUpdatingAlbum, setIsUpdatingAlbum] = useState(false);
  const [deleteTargetAlbumId, setDeleteTargetAlbumId] = useState<string | null>(null);
  const [isDeletingAlbum, setIsDeletingAlbum] = useState(false);
  const [createAlbumKind, setCreateAlbumKind] = useState<TreeMediaAlbumMediaKind>("photo");
  const [dismissedUploaderAlbumKeys, setDismissedUploaderAlbumKeys] = useState<Set<string>>(() => new Set());
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
  const [archiveViewerSession, setArchiveViewerSession] = useState<ArchiveViewerSession | null>(null);
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
  const pendingVideoPreviewPollIdsRef = useRef(new Set<string>());
  const pendingVideoPreviewPollWaitsRef = useRef(new Map<string, { timeoutId: number; resolve: (continued: boolean) => void }>());
  const pendingVideoPreviewPollFetchControllersRef = useRef(new Map<string, AbortController>());
  const uploaderLabelsById = useMemo(() => new Map(uploaderLabels.map((item) => [item.userId, item.label] as const)), [uploaderLabels]);
  const [albumMediaMap, setAlbumMediaMap] = useState<Record<string, MediaAssetRecord[]>>(persistedAlbumMediaMap);
  const [optimisticVideoPreviewUrls, setOptimisticVideoPreviewUrls] = useState<Record<string, string>>({});
  const optimisticVideoPreviewUrlsRef = useRef<Record<string, string>>({});
  const [resolvedThumbUrlsByMediaId, setResolvedThumbUrlsByMediaId] = useState<Record<string, string>>(initialThumbUrlsByMediaId);
  const [thumbRequestRetryTick, setThumbRequestRetryTick] = useState(0);
  const pendingThumbUrlIdsRef = useRef(new Set<string>());
  const pendingThumbBatchFetchControllersRef = useRef(new Set<AbortController>());
  const requestedThumbSetKeysRef = useRef(new Set<string>());
  const prefetchedThumbSetKeysRef = useRef(new Set<string>());
  const prefetchedThumbBatchFetchControllersRef = useRef(new Set<AbortController>());
  const warmedThumbUrlsRef = useRef(new Set<string>());
  const pendingImageCompletionCleanupsRef = useRef(new Set<() => void>());
  const isArchiveClientMountedRef = useRef(true);
  const pendingThumbBatchApplyRef = useRef<{
    batchKey: string;
    mediaIds: string[];
    stateApplyStartedAt: number;
  } | null>(null);
  const initialVisibleSettleStartedRef = useRef(false);
  const pendingShowMoreRevealRef = useRef<{
    visibleSetKey: string;
    mediaIds: string[];
    startedAt: number;
    prefetchedResolvedCount: number;
    warmedCount: number;
  } | null>(null);
  const previousRenderedTileIdsRef = useRef<Set<string>>(new Set());
  const previousRenderedAlbumIdsRef = useRef<Set<string>>(new Set());
  const visibleMediaRef = useRef<MediaAssetRecord[]>(allMedia.slice(0, INITIAL_TILE_LIMIT));
  const visibleSelectedAlbumMediaRef = useRef<MediaAssetRecord[]>([]);

  useEffect(() => {
    setResolvedThumbUrlsByMediaId((current) => ({ ...initialThumbUrlsByMediaId, ...current }));
  }, [initialThumbUrlsByMediaId]);

  useEffect(() => {
    return () => {
      for (const cleanup of pendingImageCompletionCleanupsRef.current) {
        cleanup();
      }
      pendingImageCompletionCleanupsRef.current.clear();
      for (const item of pendingUploadsRef.current) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
      for (const previewUrl of Object.values(optimisticVideoPreviewUrlsRef.current)) {
        URL.revokeObjectURL(previewUrl);
      }
      isArchiveClientMountedRef.current = false;
      for (const [mediaId, wait] of pendingVideoPreviewPollWaitsRef.current.entries()) {
        window.clearTimeout(wait.timeoutId);
        wait.resolve(false);
        pendingVideoPreviewPollWaitsRef.current.delete(mediaId);
      }
      for (const controller of pendingVideoPreviewPollFetchControllersRef.current.values()) {
        controller.abort();
      }
      pendingVideoPreviewPollFetchControllersRef.current.clear();
      pendingVideoPreviewPollIdsRef.current.clear();
      for (const controller of pendingThumbBatchFetchControllersRef.current.values()) {
        controller.abort();
      }
      pendingThumbBatchFetchControllersRef.current.clear();
      for (const controller of prefetchedThumbBatchFetchControllersRef.current.values()) {
        controller.abort();
      }
      prefetchedThumbBatchFetchControllersRef.current.clear();
    };
  }, []);

  function resolveArchiveThumbSource(asset: MediaAssetRecord) {
    const resolvedThumbUrl = resolvedThumbUrlsByMediaId[asset.id];
    if (resolvedThumbUrl) {
      return {
        kind: "image" as const,
        src: resolvedThumbUrl,
      };
    }

    if (canBatchResolveArchiveThumb(asset)) {
      return null;
    }

    return isHydrated ? resolveMediaThumbSource(asset, shareToken, optimisticVideoPreviewUrls) : null;
  }

  const renderStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
  const renderedTileIdsThisRender: string[] = [];
  const renderedAlbumIdsThisRender: string[] = [];

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
    optimisticVideoPreviewUrlsRef.current = optimisticVideoPreviewUrls;
  }, [optimisticVideoPreviewUrls]);

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
    const persistedUploaderKeys = new Set(
      persisted
        .map((album) => getUploaderAlbumSummaryKey(album))
        .filter((value): value is string => Boolean(value))
    );
    return [
      ...persisted,
      ...derived.filter((album) =>
        !album.uploaderUserId ||
        (() => {
          const uploaderKey = getUploaderAlbumSummaryKey(album);
          return uploaderKey ? !persistedUploaderKeys.has(uploaderKey) && !dismissedUploaderAlbumKeys.has(uploaderKey) : true;
        })()
      )
    ];
  }

  const allAlbumSummaries = useMemo(
    () => mergeUploaderAlbumsForAllMedia(mergeAlbums(persistedAllAlbumSummaries, allDerivedAlbums), archiveMedia),
    [persistedAllAlbumSummaries, allDerivedAlbums, dismissedUploaderAlbumKeys, archiveMedia]
  );
  const photoAlbumSummaries = useMemo(() => mergeAlbums(persistedPhotoAlbumSummaries, photoDerivedAlbums), [persistedPhotoAlbumSummaries, photoDerivedAlbums, dismissedUploaderAlbumKeys]);
  const videoAlbumSummaries = useMemo(() => mergeAlbums(persistedVideoAlbumSummaries, videoDerivedAlbums), [persistedVideoAlbumSummaries, videoDerivedAlbums, dismissedUploaderAlbumKeys]);

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
  const currentManualAlbums = useMemo(
    () => currentAlbums.filter((album) => album.albumKind === "manual"),
    [currentAlbums]
  );
  const selectedArchiveMediaCount = selectedArchiveMediaIds.size;
  const selectedArchiveAlbumKind = useMemo(
    () =>
      resolveSingleAlbumKind(
        [...selectedArchiveMediaIds]
          .map((mediaId) => archiveMedia.find((asset) => asset.id === mediaId) || null)
          .filter((asset): asset is MediaAssetRecord => Boolean(asset))
          .map((asset) => getAlbumCompatibleKindForAsset(asset))
      ),
    [archiveMedia, selectedArchiveMediaIds]
  );
  const manualAlbums = useMemo(
    () =>
      selectedArchiveMediaCount
        ? selectedArchiveAlbumKind
          ? currentManualAlbums.filter((album) => album.kind === selectedArchiveAlbumKind)
          : []
        : currentManualAlbums,
    [currentManualAlbums, selectedArchiveAlbumKind, selectedArchiveMediaCount]
  );
  const pendingUploadAlbumKind = useMemo(
    () => resolveSingleAlbumKind(pendingUploads.map((item) => getAlbumCompatibleKindForFile(item.file))),
    [pendingUploads]
  );
  const reviewManualAlbums = useMemo(
    () =>
      pendingUploadAlbumKind
        ? persistedAllAlbumSummaries.filter((album) => album.albumKind === "manual" && album.kind === pendingUploadAlbumKind)
        : [],
    [pendingUploadAlbumKind, persistedAllAlbumSummaries]
  );

  const visibleMedia = currentMedia.slice(0, visibleItems);
  const modeLabel = mode === "photo" ? "Фото" : mode === "video" ? "Видео" : "Все медиа";
  const itemLabel = mode === "photo" ? "фото" : mode === "video" ? "видео" : "материалов";
  const activeUpload = activeUploads.find((item) => item.status === "uploading" || item.status === "finalizing") || null;
  const selectedAlbum = selectedAlbumId ? currentAlbums.find((album) => album.id === selectedAlbumId) || null : null;
  const activeContextAlbum = view === "albums" ? selectedAlbum : null;
  const editingAlbum = editingAlbumId ? persistedAllAlbums.find((album) => album.id === editingAlbumId) || null : null;
  const deleteTargetAlbum = deleteTargetAlbumId ? persistedAllAlbums.find((album) => album.id === deleteTargetAlbumId) || null : null;
  const isReviewAlbumPinned = Boolean(
    selectedAlbum?.albumKind === "manual" && pendingUploadAlbumKind && selectedAlbum.kind === pendingUploadAlbumKind
  );
  const reviewTargetAlbumId =
    isReviewAlbumPinned
      ? selectedAlbum?.id || null
      : reviewAlbumId || null;
  const reviewTargetAlbum = reviewTargetAlbumId ? persistedAllAlbums.find((album) => album.id === reviewTargetAlbumId) || null : null;
  const isAlbumTargetedUpload = Boolean(reviewTargetAlbum);
  const selectedAlbumMedia = useMemo(() => {
    if (!selectedAlbum) {
      return [];
    }

    if (selectedAlbum.albumKind === "uploader" && selectedAlbum.uploaderUserId) {
      return currentMedia.filter((asset) =>
        asset.created_by === selectedAlbum.uploaderUserId &&
        (selectedAlbum.kind === "all" ? asset.kind === "photo" || asset.kind === "video" : asset.kind === selectedAlbum.kind)
      );
    }

    return (albumMediaMap[selectedAlbum.id] || []).filter((asset) => asset.kind === selectedAlbum.kind);
  }, [albumMediaMap, currentMedia, selectedAlbum]);
  const visibleSelectedAlbumMedia = selectedAlbumMedia.slice(0, visibleItems);
  visibleMediaRef.current = visibleMedia;
  visibleSelectedAlbumMediaRef.current = visibleSelectedAlbumMedia;

  function canBatchResolveArchiveThumb(asset: MediaAssetRecord) {
    return asset.kind === "photo" || (asset.kind === "video" && asset.provider === "cloudflare_r2" && asset.preview_status === "ready");
  }

  function isRecoverableArchiveVideoPreview(asset: MediaAssetRecord) {
    return asset.kind === "video" && asset.provider === "cloudflare_r2" && (asset.preview_status === "pending" || asset.preview_status === "processing");
  }

  function getAlbumPreviewMediaIds(album: AlbumSummary) {
    const albumMedia = getArchiveAlbumSourceMedia(album, currentMedia, albumMediaMap);
    const cover = album.coverMediaId ? albumMedia.find((asset) => asset.id === album.coverMediaId) || null : null;
    const orderedMedia = cover ? [cover, ...albumMedia.filter((asset) => asset.id !== cover.id)] : albumMedia;
    return orderedMedia
      .filter((asset) => canBatchResolveArchiveThumb(asset))
      .slice(0, 3)
      .map((asset) => asset.id);
  }

  function getAlbumPreviewRecoveryMediaIds(album: AlbumSummary) {
    const albumMedia = getArchiveAlbumSourceMedia(album, currentMedia, albumMediaMap);
    const cover = album.coverMediaId ? albumMedia.find((asset) => asset.id === album.coverMediaId) || null : null;
    const orderedMedia = cover ? [cover, ...albumMedia.filter((asset) => asset.id !== cover.id)] : albumMedia;
    return orderedMedia
      .filter((asset) => isRecoverableArchiveVideoPreview(asset))
      .slice(0, 3)
      .map((asset) => asset.id);
  }

  const visibleThumbMediaIds = useMemo(() => {
    const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
    let nextVisibleThumbMediaIds: string[];
    if (view === "all") {
      nextVisibleThumbMediaIds = [...new Set(visibleMedia.filter((asset) => canBatchResolveArchiveThumb(asset)).map((asset) => asset.id))];
    } else if (selectedAlbum) {
      nextVisibleThumbMediaIds = [...new Set(visibleSelectedAlbumMedia.filter((asset) => canBatchResolveArchiveThumb(asset)).map((asset) => asset.id))];
    } else {
      nextVisibleThumbMediaIds = [...new Set(currentAlbums.flatMap((album) => getAlbumPreviewMediaIds(album)))];
    }

    recordArchiveThumbPerfEvent({
      stage: "visible-set-compute",
      mode,
      view,
      selectedAlbumId,
      visibleItems,
      mediaCount: nextVisibleThumbMediaIds.length,
      durationMs: typeof performance !== "undefined" ? performance.now() - startedAt : null,
    });
    return nextVisibleThumbMediaIds;
  }, [currentAlbums, selectedAlbum, view, visibleMedia, visibleSelectedAlbumMedia]);

  const nextVisibleThumbMediaIds = useMemo(() => {
    const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
    let nextIds: string[] = [];

    if (view === "all" && visibleItems < currentMedia.length) {
      nextIds = [...new Set(
        currentMedia
          .slice(visibleItems, visibleItems + INITIAL_TILE_LIMIT)
          .filter((asset) => canBatchResolveArchiveThumb(asset))
          .map((asset) => asset.id)
      )];
    } else if (selectedAlbum && visibleItems < selectedAlbumMedia.length) {
      nextIds = [...new Set(
        selectedAlbumMedia
          .slice(visibleItems, visibleItems + INITIAL_TILE_LIMIT)
          .filter((asset) => canBatchResolveArchiveThumb(asset))
          .map((asset) => asset.id)
      )];
    }

    recordArchiveThumbPerfEvent({
      stage: "next-visible-set-compute",
      mode,
      view,
      selectedAlbumId,
      visibleItems,
      mediaCount: nextIds.length,
      durationMs: typeof performance !== "undefined" ? performance.now() - startedAt : null,
    });

    return nextIds;
  }, [currentMedia, mode, selectedAlbum, selectedAlbumId, selectedAlbumMedia, view, visibleItems]);

  const visibleRecoverableVideoPreviewMediaIds = useMemo(() => {
    if (view === "all") {
      return [...new Set(visibleMedia.filter((asset) => isRecoverableArchiveVideoPreview(asset)).map((asset) => asset.id))];
    }

    if (selectedAlbum) {
      return [...new Set(visibleSelectedAlbumMedia.filter((asset) => isRecoverableArchiveVideoPreview(asset)).map((asset) => asset.id))];
    }

    return [...new Set(currentAlbums.flatMap((album) => getAlbumPreviewRecoveryMediaIds(album)))];
  }, [currentAlbums, selectedAlbum, view, visibleMedia, visibleSelectedAlbumMedia]);

  useEffect(() => {
    if (!isHydrated || !visibleRecoverableVideoPreviewMediaIds.length) {
      for (const mediaId of [...pendingVideoPreviewPollIdsRef.current]) {
        const pendingWait = pendingVideoPreviewPollWaitsRef.current.get(mediaId);
        if (pendingWait) {
          window.clearTimeout(pendingWait.timeoutId);
          pendingWait.resolve(false);
          pendingVideoPreviewPollWaitsRef.current.delete(mediaId);
        }
        pendingVideoPreviewPollFetchControllersRef.current.get(mediaId)?.abort();
        pendingVideoPreviewPollFetchControllersRef.current.delete(mediaId);
        pendingVideoPreviewPollIdsRef.current.delete(mediaId);
      }
      return;
    }

    const visibleRecoveryIds = new Set(visibleRecoverableVideoPreviewMediaIds);
    for (const mediaId of [...pendingVideoPreviewPollIdsRef.current]) {
      if (visibleRecoveryIds.has(mediaId)) {
        continue;
      }

      const pendingWait = pendingVideoPreviewPollWaitsRef.current.get(mediaId);
      if (pendingWait) {
        window.clearTimeout(pendingWait.timeoutId);
        pendingWait.resolve(false);
        pendingVideoPreviewPollWaitsRef.current.delete(mediaId);
      }
      pendingVideoPreviewPollFetchControllersRef.current.get(mediaId)?.abort();
      pendingVideoPreviewPollFetchControllersRef.current.delete(mediaId);
      pendingVideoPreviewPollIdsRef.current.delete(mediaId);
    }

    for (const mediaId of visibleRecoverableVideoPreviewMediaIds) {
      void pollArchiveVideoPreviewUntilReady(mediaId);
    }
  }, [isHydrated, visibleRecoverableVideoPreviewMediaIds]);

  useEffect(() => {
    if (!isHydrated || initialVisibleSettleStartedRef.current || visibleItems !== INITIAL_TILE_LIMIT) {
      return;
    }

    initialVisibleSettleStartedRef.current = true;
    const initialVisibleSetKey = [...new Set(visibleThumbMediaIds)].sort().join(",");
    const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
    recordArchiveThumbPerfEvent({
      stage: "initial-visible-settle-start",
      visibleSetKey: initialVisibleSetKey,
      mediaCount: visibleThumbMediaIds.length,
    });

    trackArchiveImageCompletion({
      stage: "initial-visible-settle",
      visibleSetKey: initialVisibleSetKey,
      mediaIds: visibleThumbMediaIds,
      startedAt,
    });
  }, [isHydrated, visibleItems, visibleThumbMediaIds]);

  function trackArchiveImageCompletion(input: {
    stage: string;
    visibleSetKey: string;
    mediaIds: string[];
    startedAt: number;
    onComplete?: () => void;
  }) {
    if (typeof window === "undefined" || typeof performance === "undefined") {
      return;
    }

    const imageElements = input.mediaIds
      .map((mediaId) => ({
        mediaId,
        image: document.querySelector(`[data-archive-thumb-media-id="${mediaId}"] img`) as HTMLImageElement | null,
      }))
      .filter((item) => Boolean(item.image)) as Array<{ mediaId: string; image: HTMLImageElement }>;

    if (!imageElements.length) {
      recordArchiveThumbPerfEvent({
        stage: input.stage,
        visibleSetKey: input.visibleSetKey,
        mediaCount: input.mediaIds.length,
        foundImageCount: 0,
        durationMs: 0,
      });
      input.onComplete?.();
      return;
    }

    const pendingImages = imageElements.filter((item) => !item.image.complete);
    if (!pendingImages.length) {
      recordArchiveThumbPerfEvent({
        stage: input.stage,
        visibleSetKey: input.visibleSetKey,
        mediaCount: input.mediaIds.length,
        foundImageCount: imageElements.length,
        durationMs: performance.now() - input.startedAt,
      });
      input.onComplete?.();
      return;
    }

    let settledCount = 0;
    let completed = false;
    const listenerCleanups: Array<() => void> = [];
    let timeoutId = 0;

    const finalize = () => {
      if (completed) {
        return;
      }

      completed = true;
      cleanupListeners();
      recordArchiveThumbPerfEvent({
        stage: input.stage,
        visibleSetKey: input.visibleSetKey,
        mediaCount: input.mediaIds.length,
        foundImageCount: imageElements.length,
        durationMs: performance.now() - input.startedAt,
      });
      input.onComplete?.();
    };

    const cleanupListeners = () => {
      window.clearTimeout(timeoutId);
      for (const cleanup of listenerCleanups) {
        cleanup();
      }
      listenerCleanups.length = 0;
      pendingImageCompletionCleanupsRef.current.delete(cleanupListeners);
    };

    const finish = () => {
      if (completed) {
        return;
      }

      settledCount += 1;
      if (settledCount === pendingImages.length) {
        finalize();
      }
    };

    pendingImages.forEach(({ image }) => {
      const handleDone = () => {
        image.removeEventListener("load", handleDone);
        image.removeEventListener("error", handleDone);
        finish();
      };

      listenerCleanups.push(() => {
        image.removeEventListener("load", handleDone);
        image.removeEventListener("error", handleDone);
      });
      image.addEventListener("load", handleDone);
      image.addEventListener("error", handleDone);
    });

    timeoutId = window.setTimeout(() => {
      finalize();
    }, 10000);
    pendingImageCompletionCleanupsRef.current.add(cleanupListeners);
  }

  const handleShowMore = useCallback(() => {
    const nextMediaIds = [...new Set(nextVisibleThumbMediaIds)].sort();
    if (ARCHIVE_THUMB_PERF_ENABLED) {
      const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
      const prefetchedResolvedCount = nextMediaIds.filter((mediaId) => Boolean(resolvedThumbUrlsByMediaId[mediaId])).length;
      const warmedCount = nextMediaIds
        .map((mediaId) => resolvedThumbUrlsByMediaId[mediaId])
        .filter((thumbUrl): thumbUrl is string => Boolean(thumbUrl) && warmedThumbUrlsRef.current.has(thumbUrl))
        .length;
      const visibleSetKey = nextMediaIds.join(",");

      recordArchiveThumbPerfEvent({
        stage: "show-more-click",
        visibleSetKey,
        mediaCount: nextMediaIds.length,
        prefetchedResolvedCount,
        warmedCount,
      });

      pendingShowMoreRevealRef.current = {
        visibleSetKey,
        mediaIds: nextMediaIds,
        startedAt,
        prefetchedResolvedCount,
        warmedCount,
      };
    }

    setVisibleItems((current) => current + INITIAL_TILE_LIMIT);
  }, [nextVisibleThumbMediaIds, resolvedThumbUrlsByMediaId]);

  function getCurrentVisibleIncompleteImageCount(mediaIds: string[]) {
    if (typeof document === "undefined") {
      return 0;
    }

    return mediaIds.filter((mediaId) => {
      const image = document.querySelector(`[data-archive-thumb-media-id="${mediaId}"] img`) as HTMLImageElement | null;
      return image !== null && !image.complete;
    }).length;
  }

  function warmArchiveThumbUrls(input: {
    visibleSetKey: string;
    thumbUrlsByMediaId: Record<string, string>;
    deferredByIncompleteCount?: number;
  }) {
    if (typeof Image === "undefined") {
      return;
    }

    const nextThumbUrls = (Object.values(input.thumbUrlsByMediaId) as string[]).filter((thumbUrl) => !warmedThumbUrlsRef.current.has(thumbUrl));
    if (!nextThumbUrls.length) {
      return;
    }

    nextThumbUrls.forEach((thumbUrl) => {
      warmedThumbUrlsRef.current.add(thumbUrl);
      const image = new Image();
      image.decoding = "async";
      image.src = thumbUrl;
    });
    recordArchiveThumbPerfEvent({
      stage: "prefetch-image-warm",
      visibleSetKey: input.visibleSetKey,
      mediaCount: Object.keys(input.thumbUrlsByMediaId).length,
      deferredByIncompleteCount: input.deferredByIncompleteCount ?? 0,
    });
  }

  useEffect(() => {
    if (!isHydrated || !visibleThumbMediaIds.length) {
      return;
    }

    const mediaIds = [...new Set(visibleThumbMediaIds.filter(
      (mediaId) => !resolvedThumbUrlsByMediaId[mediaId] && !pendingThumbUrlIdsRef.current.has(mediaId)
    ))].sort();
    if (!mediaIds.length) {
      return;
    }

    const visibleSetKey = mediaIds.join(",");
    if (requestedThumbSetKeysRef.current.has(visibleSetKey)) {
      recordArchiveThumbPerfEvent({
        stage: "batch-request-skip",
        reason: "same-visible-set",
        visibleSetKey,
        mediaCount: mediaIds.length,
      });
      return;
    }

    mediaIds.forEach((mediaId) => pendingThumbUrlIdsRef.current.add(mediaId));
    requestedThumbSetKeysRef.current.add(visibleSetKey);
    const params = new URLSearchParams();
    if (shareToken) {
      params.set("share", shareToken);
    }
    const requestUrl = params.size ? `/api/media/thumbs?${params.toString()}` : "/api/media/thumbs";
    let requestSucceeded = false;
    let cancelled = false;
    const mediaIdBatches: string[][] = [];
    for (let index = 0; index < mediaIds.length; index += MEDIA_THUMB_BATCH_REQUEST_LIMIT) {
      mediaIdBatches.push(mediaIds.slice(index, index + MEDIA_THUMB_BATCH_REQUEST_LIMIT));
    }

    const requestStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
    recordArchiveThumbPerfEvent({
      stage: "batch-request-start",
      visibleSetKey,
      mediaCount: mediaIds.length,
      batchCount: mediaIdBatches.length,
      batchSizes: mediaIdBatches.map((batch) => batch.length),
    });

    void Promise.allSettled(
      mediaIdBatches.map(async (batchMediaIds) => {
        const batchStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
        const controller = new AbortController();
        pendingThumbBatchFetchControllersRef.current.add(controller);
        const response = await fetch(requestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            treeId,
            mediaIds: batchMediaIds,
          }),
          signal: controller.signal,
        });
        pendingThumbBatchFetchControllersRef.current.delete(controller);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Запрос не выполнен.");
        }

        recordArchiveThumbPerfEvent({
          stage: "batch-request-response",
          visibleSetKey,
          mediaCount: batchMediaIds.length,
          durationMs: typeof performance !== "undefined" ? performance.now() - batchStartedAt : null,
          cacheState: response.headers.get("X-Archive-Thumb-Batch-Cache"),
          serverTotalMs: parseServerTimingDuration(response.headers.get("Server-Timing"), "archive-thumb-batch-total"),
          serverResolveMs: parseServerTimingDuration(response.headers.get("Server-Timing"), "archive-thumb-batch-resolve"),
        });

        return payload;
      })
    )
      .then((results) => {
        if (!isArchiveClientMountedRef.current || cancelled) {
          return;
        }

        requestSucceeded = results.every((result) => result.status === "fulfilled");
        const successfulPayloads = results
          .filter((result): result is PromiseFulfilledResult<Record<string, unknown>> => result.status === "fulfilled")
          .map((result) => result.value);
        const nextResolvedThumbUrlsByMediaId = Object.assign({}, ...successfulPayloads.map((payload) => payload?.urlsByMediaId || {}));
        if (!Object.keys(nextResolvedThumbUrlsByMediaId).length) {
          return;
        }

        const resolvedMediaIds = Object.keys(nextResolvedThumbUrlsByMediaId);
        pendingThumbBatchApplyRef.current = {
          batchKey: visibleSetKey,
          mediaIds: resolvedMediaIds,
          stateApplyStartedAt: typeof performance !== "undefined" ? performance.now() : 0,
        };
        setResolvedThumbUrlsByMediaId((current) => ({
          ...current,
          ...nextResolvedThumbUrlsByMediaId,
        }));
        recordArchiveThumbPerfEvent({
          stage: "batch-request-finish",
          visibleSetKey,
          mediaCount: resolvedMediaIds.length,
          durationMs: typeof performance !== "undefined" ? performance.now() - requestStartedAt : null,
        });
      })
      .catch(() => undefined)
      .finally(() => {
        mediaIds.forEach((mediaId) => pendingThumbUrlIdsRef.current.delete(mediaId));
        if (!requestSucceeded) {
          requestedThumbSetKeysRef.current.delete(visibleSetKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isHydrated, resolvedThumbUrlsByMediaId, shareToken, thumbRequestRetryTick, treeId, visibleThumbMediaIds]);

  useEffect(() => {
    if (!isHydrated || !nextVisibleThumbMediaIds.length) {
      return;
    }

    const currentVisibleSetResolved = visibleThumbMediaIds.every((mediaId) => resolvedThumbUrlsByMediaId[mediaId]);
    if (!currentVisibleSetResolved) {
      return;
    }

    const nextMediaIds = [...new Set(nextVisibleThumbMediaIds.filter(
      (mediaId) => !resolvedThumbUrlsByMediaId[mediaId] && !pendingThumbUrlIdsRef.current.has(mediaId)
    ))].sort();
    if (!nextMediaIds.length) {
      return;
    }

    const currentVisibleSetKey = [...new Set(visibleThumbMediaIds)].sort().join(",");
    const nextVisibleSetKey = nextMediaIds.join(",");
    if (prefetchedThumbSetKeysRef.current.has(nextVisibleSetKey) || requestedThumbSetKeysRef.current.has(nextVisibleSetKey)) {
      recordArchiveThumbPerfEvent({
        stage: "prefetch-skip",
        reason: prefetchedThumbSetKeysRef.current.has(nextVisibleSetKey) ? "already-prefetched" : "already-requested",
        visibleSetKey: nextVisibleSetKey,
        mediaCount: nextMediaIds.length,
      });
      return;
    }

    const params = new URLSearchParams();
    if (shareToken) {
      params.set("share", shareToken);
    }
    const requestUrl = params.size ? `/api/media/thumbs?${params.toString()}` : "/api/media/thumbs";
    const mediaIdBatches: string[][] = [];
    for (let index = 0; index < nextMediaIds.length; index += MEDIA_THUMB_BATCH_REQUEST_LIMIT) {
      mediaIdBatches.push(nextMediaIds.slice(index, index + MEDIA_THUMB_BATCH_REQUEST_LIMIT));
    }

    let cancelled = false;
    let requestSucceeded = false;
    const cancelIdlePrefetch = scheduleArchiveThumbIdleCallback(() => {
      if (cancelled) {
        return;
      }

      prefetchedThumbSetKeysRef.current.add(nextVisibleSetKey);
      nextMediaIds.forEach((mediaId) => pendingThumbUrlIdsRef.current.add(mediaId));
      const requestStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
      const currentVisibleIncompleteImageCount = getCurrentVisibleIncompleteImageCount(visibleThumbMediaIds);
      recordArchiveThumbPerfEvent({
        stage: "prefetch-start",
        visibleSetKey: nextVisibleSetKey,
        mediaCount: nextMediaIds.length,
        batchCount: mediaIdBatches.length,
        batchSizes: mediaIdBatches.map((batch) => batch.length),
        currentVisibleIncompleteImageCount,
      });

      void Promise.all(
        mediaIdBatches.map(async (batchMediaIds) => {
          const batchStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
          const controller = new AbortController();
          prefetchedThumbBatchFetchControllersRef.current.add(controller);
          const response = await fetch(requestUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              treeId,
              mediaIds: batchMediaIds,
            }),
            signal: controller.signal,
          });
          prefetchedThumbBatchFetchControllersRef.current.delete(controller);
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error || "Запрос не выполнен.");
          }

          recordArchiveThumbPerfEvent({
            stage: "prefetch-response",
            visibleSetKey: nextVisibleSetKey,
            mediaCount: batchMediaIds.length,
            durationMs: typeof performance !== "undefined" ? performance.now() - batchStartedAt : null,
            cacheState: response.headers.get("X-Archive-Thumb-Batch-Cache"),
            serverTotalMs: parseServerTimingDuration(response.headers.get("Server-Timing"), "archive-thumb-batch-total"),
            serverResolveMs: parseServerTimingDuration(response.headers.get("Server-Timing"), "archive-thumb-batch-resolve"),
          });

          return payload;
        })
      )
        .then((payloads) => {
          if (!isArchiveClientMountedRef.current || cancelled) {
            return;
          }

          const nextResolvedThumbUrlsByMediaId = Object.assign({}, ...payloads.map((payload) => payload?.urlsByMediaId || {}));
          if (!Object.keys(nextResolvedThumbUrlsByMediaId).length) {
            return;
          }

          setResolvedThumbUrlsByMediaId((current) => ({
            ...current,
            ...nextResolvedThumbUrlsByMediaId,
          }));
          requestSucceeded = true;
          recordArchiveThumbPerfEvent({
            stage: "prefetch-finish",
            visibleSetKey: nextVisibleSetKey,
            mediaCount: nextMediaIds.length,
            durationMs: typeof performance !== "undefined" ? performance.now() - requestStartedAt : null,
          });

          if (currentVisibleIncompleteImageCount === 0) {
            warmArchiveThumbUrls({
              visibleSetKey: nextVisibleSetKey,
              thumbUrlsByMediaId: nextResolvedThumbUrlsByMediaId,
            });
          } else {
            recordArchiveThumbPerfEvent({
              stage: "prefetch-image-warm-deferred",
              visibleSetKey: nextVisibleSetKey,
              mediaCount: Object.keys(nextResolvedThumbUrlsByMediaId).length,
              blockedByIncompleteCount: currentVisibleIncompleteImageCount,
            });

            trackArchiveImageCompletion({
              stage: "prefetch-current-visible-settle",
              visibleSetKey: currentVisibleSetKey,
              mediaIds: visibleThumbMediaIds,
              startedAt: requestStartedAt,
              onComplete: () => {
                warmArchiveThumbUrls({
                  visibleSetKey: nextVisibleSetKey,
                  thumbUrlsByMediaId: nextResolvedThumbUrlsByMediaId,
                  deferredByIncompleteCount: currentVisibleIncompleteImageCount,
                });
              },
            });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          nextMediaIds.forEach((mediaId) => pendingThumbUrlIdsRef.current.delete(mediaId));
          if (!requestSucceeded) {
            prefetchedThumbSetKeysRef.current.delete(nextVisibleSetKey);
            if (isArchiveClientMountedRef.current) {
              setThumbRequestRetryTick((current) => current + 1);
            }
          }
        });
    });

    recordArchiveThumbPerfEvent({
      stage: "prefetch-scheduled",
      visibleSetKey: nextVisibleSetKey,
      mediaCount: nextMediaIds.length,
    });

    return () => {
      cancelled = true;
      cancelIdlePrefetch();
    };
  }, [isHydrated, nextVisibleThumbMediaIds, resolvedThumbUrlsByMediaId, shareToken, treeId, visibleThumbMediaIds]);

  useEffect(() => {
    const pendingThumbBatchApply = pendingThumbBatchApplyRef.current;
    if (!pendingThumbBatchApply) {
      return;
    }

    if (!pendingThumbBatchApply.mediaIds.every((mediaId) => resolvedThumbUrlsByMediaId[mediaId])) {
      return;
    }

    pendingThumbBatchApplyRef.current = null;
    const stateApplyDurationMs =
      typeof performance !== "undefined" ? performance.now() - pendingThumbBatchApply.stateApplyStartedAt : null;
    recordArchiveThumbPerfEvent({
      stage: "state-apply",
      batchKey: pendingThumbBatchApply.batchKey,
      mediaCount: pendingThumbBatchApply.mediaIds.length,
      durationMs: stateApplyDurationMs,
    });

    if (typeof window === "undefined" || typeof performance === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      recordArchiveThumbPerfEvent({
        stage: "render-update",
        batchKey: pendingThumbBatchApply.batchKey,
        mediaCount: pendingThumbBatchApply.mediaIds.length,
        durationMs: performance.now() - pendingThumbBatchApply.stateApplyStartedAt,
      });
      trackArchiveImageCompletion({
        stage: "image-load",
        visibleSetKey: pendingThumbBatchApply.batchKey,
        mediaIds: pendingThumbBatchApply.mediaIds,
        startedAt: pendingThumbBatchApply.stateApplyStartedAt,
      });
    });
  }, [resolvedThumbUrlsByMediaId]);

  useEffect(() => {
    const pendingShowMoreReveal = pendingShowMoreRevealRef.current;
    if (!pendingShowMoreReveal) {
      return;
    }

    if (!pendingShowMoreReveal.mediaIds.length) {
      pendingShowMoreRevealRef.current = null;
      recordArchiveThumbPerfEvent({
        stage: "show-more-visible",
        visibleSetKey: pendingShowMoreReveal.visibleSetKey,
        mediaCount: 0,
        prefetchedResolvedCount: pendingShowMoreReveal.prefetchedResolvedCount,
        warmedCount: pendingShowMoreReveal.warmedCount,
        durationMs: typeof performance !== "undefined" ? performance.now() - pendingShowMoreReveal.startedAt : null,
      });
      return;
    }

    const allThumbsResolved = pendingShowMoreReveal.mediaIds.every((mediaId) => Boolean(resolvedThumbUrlsByMediaId[mediaId]));
    if (!allThumbsResolved) {
      return;
    }

    pendingShowMoreRevealRef.current = null;
    if (typeof window === "undefined" || typeof performance === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      recordArchiveThumbPerfEvent({
        stage: "show-more-render",
        visibleSetKey: pendingShowMoreReveal.visibleSetKey,
        mediaCount: pendingShowMoreReveal.mediaIds.length,
        prefetchedResolvedCount: pendingShowMoreReveal.prefetchedResolvedCount,
        warmedCount: pendingShowMoreReveal.warmedCount,
        durationMs: performance.now() - pendingShowMoreReveal.startedAt,
      });
      trackArchiveImageCompletion({
        stage: "show-more-visible",
        visibleSetKey: pendingShowMoreReveal.visibleSetKey,
        mediaIds: pendingShowMoreReveal.mediaIds,
        startedAt: pendingShowMoreReveal.startedAt,
      });
    });
  }, [resolvedThumbUrlsByMediaId]);

  useEffect(() => {
    const renderedTileIdSet = new Set(renderedTileIdsThisRender);
    const renderedAlbumIdSet = new Set(renderedAlbumIdsThisRender);

    recordArchiveThumbPerfEvent({
      stage: "render-commit",
      mode,
      view,
      selectedAlbumId,
      visibleItems,
      renderDurationMs: typeof performance !== "undefined" ? performance.now() - renderStartedAt : null,
      tileRenderCallCount: renderedTileIdsThisRender.length,
      tileUniqueCount: renderedTileIdSet.size,
      rerenderedExistingTileCount: [...renderedTileIdSet].filter((id) => previousRenderedTileIdsRef.current.has(id)).length,
      albumRenderCallCount: renderedAlbumIdsThisRender.length,
      albumUniqueCount: renderedAlbumIdSet.size,
      rerenderedExistingAlbumCount: [...renderedAlbumIdSet].filter((id) => previousRenderedAlbumIdsRef.current.has(id)).length,
    });

    previousRenderedTileIdsRef.current = renderedTileIdSet;
    previousRenderedAlbumIdsRef.current = renderedAlbumIdSet;
  });

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
    if (mode === "photo" || mode === "video") {
      setCreateAlbumKind(mode);
      return;
    }

    if (selectedAlbum?.albumKind === "manual" && selectedAlbum.kind !== "all") {
      setCreateAlbumKind(selectedAlbum.kind);
      return;
    }

    if (pendingUploadAlbumKind) {
      setCreateAlbumKind(pendingUploadAlbumKind);
    }
  }, [mode, pendingUploadAlbumKind, selectedAlbum]);

  useEffect(() => {
    const compatibleAlbumIds = new Set(reviewManualAlbums.map((album) => album.id));
    setReviewAlbumId((currentReviewAlbumId) => {
      if (selectedAlbum?.albumKind === "manual" && pendingUploadAlbumKind && selectedAlbum.kind === pendingUploadAlbumKind) {
        return selectedAlbum.id;
      }

      return currentReviewAlbumId && compatibleAlbumIds.has(currentReviewAlbumId) ? currentReviewAlbumId : "";
    });
  }, [pendingUploadAlbumKind, reviewManualAlbums, selectedAlbum]);

  useEffect(() => {
    if (reviewTargetAlbum) {
      setReviewVisibility(reviewTargetAlbum.access);
    }
  }, [reviewTargetAlbum]);

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
        archiveViewerSession ||
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
    archiveViewerSession,
    isUploadReviewOpen,
    openArchiveActionsMediaId,
    openArchiveAlbumChooserMediaId,
    selectedArchiveMediaCount,
  ]);
  const viewerMedia = useMemo(
    () =>
      archiveViewerSession
        ? archiveViewerSession.mediaIds
            .map((assetId) => archiveMedia.find((asset) => asset.id === assetId) || null)
            .filter((asset): asset is MediaAssetRecord => Boolean(asset))
        : [],
    [archiveMedia, archiveViewerSession]
  );
  const deleteTargetAsset = deleteTargetMediaId ? archiveMedia.find((asset) => asset.id === deleteTargetMediaId) || null : null;
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

  function storeOptimisticVideoPreview(mediaId: string, previewUrl: string) {
    setOptimisticVideoPreviewUrls((current) => {
      if (current[mediaId] === previewUrl) {
        return current;
      }

      return {
        ...current,
        [mediaId]: previewUrl
      };
    });
  }

  function clearOptimisticVideoPreview(mediaId: string) {
    setOptimisticVideoPreviewUrls((current) => {
      const previewUrl = current[mediaId];
      if (!previewUrl) {
        return current;
      }

      URL.revokeObjectURL(previewUrl);
      const next = { ...current };
      delete next[mediaId];
      return next;
    });
  }

  useEffect(() => {
    if (!archiveViewerSession) {
      return;
    }

    if (!viewerMedia.length) {
      setArchiveViewerSession(null);
      return;
    }

    if (viewerMedia.some((asset) => asset.id === archiveViewerSession.initialMediaId)) {
      return;
    }

    setArchiveViewerSession((currentSession) =>
      currentSession
        ? {
            ...currentSession,
            initialMediaId: viewerMedia[0]?.id || currentSession.initialMediaId,
          }
        : currentSession
    );
  }, [archiveViewerSession, viewerMedia]);

  const openMediaViewer = useCallback((assetId: string, items: MediaAssetRecord[]) => {
    const scopedItems = (() => {
      const isOversizedArchiveGridScope = view === "all";
      const isMergedUploaderAlbumScope = view === "albums" && selectedAlbum?.albumKind === "uploader" && selectedAlbum.kind === "all";

      if ((!isOversizedArchiveGridScope && !isMergedUploaderAlbumScope) || items.length <= ARCHIVE_VIEWER_WINDOW_LIMIT) {
        return items;
      }

      const activeIndex = items.findIndex((asset) => asset.id === assetId);
      if (activeIndex < 0) {
        return items.slice(0, ARCHIVE_VIEWER_WINDOW_LIMIT);
      }

      const halfWindow = Math.floor(ARCHIVE_VIEWER_WINDOW_LIMIT / 2);
      let startIndex = Math.max(0, activeIndex - halfWindow);
      let endIndex = startIndex + ARCHIVE_VIEWER_WINDOW_LIMIT;

      if (endIndex > items.length) {
        endIndex = items.length;
        startIndex = Math.max(0, endIndex - ARCHIVE_VIEWER_WINDOW_LIMIT);
      }

      return items.slice(startIndex, endIndex);
    })();

    setArchiveViewerSession({
      mediaIds: scopedItems.map((asset) => asset.id),
      initialMediaId: assetId,
    });
  }, [selectedAlbum, view]);

  function clearArchiveSelection() {
    setIsArchiveSelectionMode(false);
    setSelectedArchiveMediaIds(new Set());
    setIsBulkArchiveDeleteConfirmOpen(false);
    setIsAddToAlbumPickerOpen(false);
  }

  const toggleArchiveSelection = useCallback((mediaId: string) => {
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
  }, [canEdit]);

  const startArchiveSelectionMode = useCallback((mediaId: string) => {
    if (!canEdit) {
      return;
    }

    setIsArchiveSelectionMode(true);
    setSelectedArchiveMediaIds((currentSelection) => new Set([...currentSelection, mediaId]));
  }, [canEdit]);

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
      const uploaderAlbumKind = getAlbumCompatibleKindForAsset(asset);
      const uploaderAlbum =
        (uploaderAlbumKind
          ? allAlbumSummaries.find((album) => album.id === buildUploaderAlbumSyntheticId(asset.created_by as string, uploaderAlbumKind)) ||
            allAlbumSummaries.find((album) => album.albumKind === "uploader" && album.uploaderUserId === asset.created_by && album.kind === uploaderAlbumKind)
          : null) ||
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

  const handleArchiveTileOpen = useCallback((mediaId: string, scope: ArchiveTileScope) => {
    const scopedItems = scope === "album" ? visibleSelectedAlbumMediaRef.current : visibleMediaRef.current;
    openMediaViewer(mediaId, scopedItems);
  }, [openMediaViewer]);

  const handleArchiveTileActionsMenuOpenChange = useCallback((mediaId: string, open: boolean) => {
    if (open) {
      setOpenArchiveActionsMediaId(mediaId);
      return;
    }

    setOpenArchiveActionsMediaId((current) => (current === mediaId ? null : current));
    setOpenArchiveAlbumChooserMediaId((current) => (current === mediaId ? null : current));
  }, []);

  const handleArchiveTileAlbumChooserOpen = useCallback((mediaId: string) => {
    setOpenArchiveAlbumChooserMediaId(mediaId || null);
  }, []);

  const handleArchiveTileDelete = useCallback((mediaId: string) => {
    setDeleteTargetMediaId(mediaId);
  }, []);

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
    setArchiveViewerSession((currentSession) => {
      if (!currentSession) {
        return currentSession;
      }

      const nextMediaIds = currentSession.mediaIds.filter((mediaId) => !deletedMediaIds.has(mediaId));
      if (!nextMediaIds.length) {
        return null;
      }

      return {
        mediaIds: nextMediaIds,
        initialMediaId: deletedMediaIds.has(currentSession.initialMediaId) ? nextMediaIds[0] : currentSession.initialMediaId,
      };
    });
    for (const mediaId of deletedMediaIds) {
      clearOptimisticVideoPreview(mediaId);
    }
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
    const thumbSource = resolveArchiveThumbSource(asset);
    const downloadHref = buildDownloadUrl(asset, shareToken);
    const albumOptions = getArchiveAlbumOptionsForAsset(asset);
    const isSelected = selectedArchiveMediaIds.has(asset.id);
    const isActionsMenuOpen = openArchiveActionsMediaId === asset.id;
    const isAlbumChooserOpen = openArchiveAlbumChooserMediaId === asset.id;
    const scope: ArchiveTileScope = items === visibleSelectedAlbumMedia ? "album" : "grid";

    return (
      <ArchiveTile
        key={asset.id}
        asset={asset}
        scope={scope}
        thumbSource={thumbSource}
        downloadHref={downloadHref}
        albumOptions={albumOptions}
        isSelected={isSelected}
        isArchiveSelectionMode={isArchiveSelectionMode}
        isActionsMenuOpen={isActionsMenuOpen}
        isAlbumChooserOpen={isAlbumChooserOpen}
        canEdit={canEdit}
        onToggleSelection={toggleArchiveSelection}
        onOpen={handleArchiveTileOpen}
        onActionsMenuOpenChange={handleArchiveTileActionsMenuOpenChange}
        onAlbumChooserOpen={handleArchiveTileAlbumChooserOpen}
        onStartSelection={startArchiveSelectionMode}
        onDelete={handleArchiveTileDelete}
        onRender={(mediaId) => {
          renderedTileIdsThisRender.push(mediaId);
        }}
      />
    );
  }

  function getAlbumPreviewItems(album: AlbumSummary): AlbumPreviewItem[] {
    const albumMedia = getArchiveAlbumSourceMedia(album, currentMedia, albumMediaMap);
    const cover = album.coverMediaId ? albumMedia.find((asset) => asset.id === album.coverMediaId) || null : null;
    const orderedMedia = cover ? [cover, ...albumMedia.filter((asset) => asset.id !== cover.id)] : albumMedia;
    const previewItems: AlbumPreviewItem[] = [];

    for (const asset of orderedMedia) {
      const thumbSource = resolveArchiveThumbSource(asset);
      if (!thumbSource) {
        continue;
      }

      previewItems.push({
        asset,
        thumbSource,
      });

      if (previewItems.length === 3) {
        break;
      }
    }

    return previewItems;
  }

  function renderArchiveAlbumPreviewTile(item: AlbumPreviewItem, className: string, mediaStyle: CSSProperties = ARCHIVE_ALBUM_PREVIEW_MEDIA_STYLE) {
    return (
      <MediaThumbVisual
        key={item.asset.id}
        asset={item.asset}
        thumbSource={item.thumbSource}
        shareToken={shareToken}
        containerClassName={className}
        mediaClassName="archive-album-image archive-album-preview-media"
        placeholder={null}
        showToneOverlay={false}
        showVideoChrome={false}
        disableDurationProbe
        containerStyle={ARCHIVE_ALBUM_PREVIEW_TILE_STYLE}
        mediaStyle={mediaStyle}
      />
    );
  }

  function renderArchiveAlbumCover(album: AlbumSummary, hasVideoIdentity: boolean) {
    const previewItems = getAlbumPreviewItems(album);

    if (!previewItems.length) {
      return hasVideoIdentity ? (
        <div className="archive-album-empty-placeholder archive-album-empty-placeholder-video" aria-hidden="true" />
      ) : (
        renderArchivePlaceholder("photo")
      );
    }

    if (previewItems.length === 1) {
      const [cover] = previewItems;
      return (
        <MediaThumbVisual
          asset={cover.asset}
          thumbSource={cover.thumbSource}
          shareToken={shareToken}
          containerClassName="archive-album-cover-visual"
          mediaClassName={cover.thumbSource.kind === "image" ? "archive-album-image" : "archive-album-image archive-tile-video"}
          placeholder={null}
          showVideoChrome={false}
          disableDurationProbe
        />
      );
    }

    if (previewItems.length === 2) {
      return (
        <div
          className="archive-album-cover-layout archive-album-cover-layout-two"
          data-preview-count="2"
          style={ARCHIVE_ALBUM_LAYOUT_TWO_STYLE}
        >
          {previewItems.map((item) => renderArchiveAlbumPreviewTile(item, "archive-album-preview-tile"))}
          <span className="archive-album-cover-tone" aria-hidden="true" style={ARCHIVE_ALBUM_PREVIEW_OVERLAY_STYLE} />
        </div>
      );
    }

    return (
      <div
        className="archive-album-cover-layout archive-album-cover-layout-three"
        data-preview-count="3"
        style={ARCHIVE_ALBUM_LAYOUT_THREE_STYLE}
      >
        {renderArchiveAlbumPreviewTile(previewItems[0], "archive-album-preview-tile archive-album-preview-tile-primary")}
        <div className="archive-album-preview-column" style={ARCHIVE_ALBUM_PREVIEW_COLUMN_STYLE}>
          {previewItems
            .slice(1, 3)
            .map((item) => renderArchiveAlbumPreviewTile(item, "archive-album-preview-tile", ARCHIVE_ALBUM_PREVIEW_MEDIA_SECONDARY_STYLE))}
        </div>
        <span className="archive-album-cover-tone" aria-hidden="true" style={ARCHIVE_ALBUM_PREVIEW_OVERLAY_STYLE} />
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
    setCreateAlbumAccess("members");
    if (mode === "photo" || mode === "video") {
      setCreateAlbumKind(mode);
    }
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
      kind: album.kind,
      access: album.access,
      albumKind: "uploader",
      uploaderUserId: album.uploaderUserId
    });
    const created = payload.album as TreeMediaAlbumRecord;
    const summary: AlbumSummary = {
      id: created.id,
      title: created.title,
      description: created.description,
      kind: created.kind,
      access: created.access,
      albumKind: created.album_kind,
      uploaderUserId: created.uploader_user_id,
      count: album.count,
      coverMediaId: album.coverMediaId
    };

    setPersistedAllAlbums((current) => {
      const next = current.filter((item) => getUploaderAlbumSummaryKey(item) !== getUploaderAlbumSummaryKey(summary));
      return [summary, ...next];
    });
    setDismissedUploaderAlbumKeys((current) => {
      const uploaderKey = getUploaderAlbumSummaryKey(summary);
      if (!uploaderKey) {
        return current;
      }
      const next = new Set(current);
      next.delete(uploaderKey);
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
      setEditAlbumAccess(managedAlbum.access);
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

  async function pollArchiveVideoPreviewUntilReady(mediaId: string) {
    if (pendingVideoPreviewPollIdsRef.current.has(mediaId)) {
      return;
    }

    pendingVideoPreviewPollIdsRef.current.add(mediaId);

    try {
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const shouldContinue = await new Promise<boolean>((resolve) => {
          const timeoutId = window.setTimeout(() => {
            pendingVideoPreviewPollWaitsRef.current.delete(mediaId);
            resolve(true);
          }, attempt < 6 ? 2000 : 5000);

          pendingVideoPreviewPollWaitsRef.current.set(mediaId, {
            timeoutId,
            resolve
          });
        });
        if (!shouldContinue || !isArchiveClientMountedRef.current || !pendingVideoPreviewPollIdsRef.current.has(mediaId)) {
          break;
        }
        const params = new URLSearchParams();
        params.set("summary", "1");
        if (shareToken) {
          params.set("share", shareToken);
        }

        const controller = new AbortController();
        pendingVideoPreviewPollFetchControllersRef.current.set(mediaId, controller);
        const response = await fetch(`/api/media/${mediaId}?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        }).catch(() => null);
        pendingVideoPreviewPollFetchControllersRef.current.delete(mediaId);
        if (!isArchiveClientMountedRef.current || !pendingVideoPreviewPollIdsRef.current.has(mediaId)) {
          break;
        }
        if (!response || !response.ok) {
          continue;
        }

        const payload = await response.json().catch(() => null);
        const refreshedMedia = payload?.media as MediaAssetRecord | undefined;
        if (!refreshedMedia) {
          continue;
        }

        setArchiveMedia((current) => current.map((asset) => (asset.id === mediaId ? refreshedMedia : asset)));
        setAlbumMediaMap((current) =>
          Object.fromEntries(
            Object.entries(current).map(([albumId, items]) => [
              albumId,
              items.map((asset) => (asset.id === mediaId ? refreshedMedia : asset))
            ])
          )
        );

        if (refreshedMedia.preview_status !== "pending" && refreshedMedia.preview_status !== "processing") {
          clearOptimisticVideoPreview(mediaId);
          break;
        }
      }
    } finally {
      const pendingWait = pendingVideoPreviewPollWaitsRef.current.get(mediaId);
      if (pendingWait) {
        window.clearTimeout(pendingWait.timeoutId);
        pendingWait.resolve(false);
        pendingVideoPreviewPollWaitsRef.current.delete(mediaId);
      }
      pendingVideoPreviewPollFetchControllersRef.current.get(mediaId)?.abort();
      pendingVideoPreviewPollFetchControllersRef.current.delete(mediaId);
      pendingVideoPreviewPollIdsRef.current.delete(mediaId);
    }
  }

  async function handleCreateAlbum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsCreatingAlbum(true);
      const payload = await requestJson("/api/media/albums", "POST", {
        treeId,
        title: albumTitle,
        description: albumDescription,
        kind: createAlbumKind,
        access: createAlbumAccess
      });
      const album = payload.album as TreeMediaAlbumRecord;
      const summary: AlbumSummary = {
        id: album.id,
        title: album.title,
        description: album.description,
        kind: album.kind,
        access: album.access,
        albumKind: album.album_kind,
        uploaderUserId: album.uploader_user_id,
        count: 0,
        coverMediaId: null
      };
      setPersistedAllAlbums((current) => [summary, ...current]);
      setAlbumTitle("");
      setAlbumDescription("");
      setCreateAlbumAccess("members");
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
        description: editAlbumDescription,
        access: editAlbumAccess
      });
      const album = payload.album as TreeMediaAlbumRecord;

      setPersistedAllAlbums((current) =>
        current.map((item) =>
          item.id === album.id
            ? {
                ...item,
                title: album.title,
                description: album.description,
                access: album.access,
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
        const uploaderKey = getUploaderAlbumSummaryKey(deleteTargetAlbum);
        if (uploaderKey) {
          setDismissedUploaderAlbumKeys((current) => {
            const next = new Set(current);
            next.add(uploaderKey);
            return next;
          });
        }
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
    const shouldStopUploadFlow = (previewUrl: string | null) => {
      if (isArchiveClientMountedRef.current) {
        return false;
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      return true;
    };

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
      if (shouldStopUploadFlow(uploadItem.previewUrl)) {
        return;
      }

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
        if (!isArchiveClientMountedRef.current) {
          return;
        }

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
      if (shouldStopUploadFlow(uploadItem.previewUrl)) {
        return;
      }

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
      if (shouldStopUploadFlow(uploadItem.previewUrl)) {
        return;
      }

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
      if (shouldStopUploadFlow(uploadItem.previewUrl)) {
        return;
      }
      setError(null);

      if (
        createdMedia.kind === "video" &&
        createdMedia.provider === "cloudflare_r2" &&
        (createdMedia.preview_status === "pending" || createdMedia.preview_status === "processing") &&
        uploadItem.previewUrl
      ) {
        storeOptimisticVideoPreview(createdMedia.id, uploadItem.previewUrl);
        void pollArchiveVideoPreviewUntilReady(createdMedia.id);
      } else if (uploadItem.previewUrl) {
        URL.revokeObjectURL(uploadItem.previewUrl);
      }
    }

    if (!isArchiveClientMountedRef.current) {
      return;
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
    const nextPendingUploads = [...pendingUploadsRef.current, ...nextItems];
    const nextPendingUploadKind = resolveSingleAlbumKind(nextPendingUploads.map((item) => getAlbumCompatibleKindForFile(item.file)));
    setPendingUploads((current) => [...current, ...nextItems]);
    if (selectedAlbum?.albumKind === "manual" && nextPendingUploadKind && selectedAlbum.kind === nextPendingUploadKind) {
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
      setPendingUploads([]);
      setReviewAlbumId("");
      setReviewVisibility("members");
      setReviewCaption("");
      setIsUploadReviewOpen(false);
      setIsDiscardConfirmOpen(false);
      setStatus(null);
      setError(null);
      void uploadArchiveFiles(uploads, reviewTargetAlbumId, uploadOptions).catch((uploadError) => {
        if (!isArchiveClientMountedRef.current) {
          return;
        }

        setStatus(null);
        setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить материалы в архив.");
      }).finally(() => {
        if (!isArchiveClientMountedRef.current) {
          return;
        }

        setIsSavingUploads(false);
        setActiveUploads([]);
      });
    } catch (uploadError) {
      setStatus(null);
      setIsSavingUploads(false);
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
          <TabsTrigger className={`pill-link${mode === "audio" ? " pill-link-active" : ""}`} value="audio">
            Аудио
          </TabsTrigger>
          <TabsTrigger className={`pill-link${mode === "document" ? " pill-link-active" : ""}`} value="document">
            Документы
          </TabsTrigger>
          <TabsTrigger className={`pill-link${mode === "all" ? " pill-link-active" : ""}`} value="all">
            Все медиа
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "audio" ? (
        <AudioArchiveView
          treeId={treeId}
          slug={slug}
          shareToken={shareToken}
          canEdit={canEdit}
          media={archiveMedia.filter((a) => a.kind === "audio")}
          onMediaChange={(next) => {
            setArchiveMedia((current) => {
              const nonAudio = current.filter((a) => a.kind !== "audio");
              return [...next, ...nonAudio.filter((a) => !next.some((n) => n.id === a.id))];
            });
          }}
        />
      ) : mode === "document" ? (
        <DocumentArchiveView
          treeId={treeId}
          slug={slug}
          shareToken={shareToken}
          canEdit={canEdit}
          media={archiveMedia.filter((a) => a.kind === "document")}
          onMediaChange={(next) => {
            setArchiveMedia((current) => {
              const nonDoc = current.filter((a) => a.kind !== "document");
              return [...next, ...nonDoc.filter((a) => !next.some((n) => n.id === a.id))];
            });
          }}
        />
      ) : (
      <>

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
              {visibleMedia.map((asset) => renderArchiveTile(asset, visibleMedia))}
            </div>

            {visibleItems < currentMedia.length ? (
              <div className="action-row archive-actions">
                <Button type="button" variant="ghost" onClick={handleShowMore}>
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
            <>
              <div className="archive-grid archive-grid-album">
                {visibleSelectedAlbumMedia.map((asset) => renderArchiveTile(asset, visibleSelectedAlbumMedia))}
              </div>

              {visibleItems < selectedAlbumMedia.length ? (
                <div className="action-row archive-actions">
                  <Button type="button" variant="ghost" onClick={handleShowMore}>
                    Показать еще
                  </Button>
                  <span className="members-static-note">
                    Показано {Math.min(visibleItems, selectedAlbumMedia.length)} из {selectedAlbumMedia.length} {mode === "all" ? "материалов" : itemLabel}
                  </span>
                </div>
              ) : null}
            </>
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
            renderedAlbumIdsThisRender.push(album.id);
            const isAlbumActionsOpen = openArchiveAlbumActionsId === album.id;
            const albumMedia = getArchiveAlbumSourceMedia(album, currentMedia, albumMediaMap);
            const albumContentLabel = formatArchiveAlbumContentLabel(album, albumMedia);
            const hasVideoIndicator = hasArchiveAlbumVideoIndicator(album, albumMedia);

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
                  <div className={`archive-album-cover${hasVideoIndicator ? " archive-album-cover-video" : ""}`}>
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
                            onClick={(event) => {
                              event.stopPropagation();
                              void openEditAlbumDialog(album);
                            }}
                          >
                            Редактировать
                          </button>
                          <button
                            type="button"
                            className="archive-card-menu-item archive-card-menu-item-danger"
                            onClick={(event) => {
                              event.stopPropagation();
                              void openDeleteAlbumDialog(album);
                            }}
                          >
                            Удалить
                          </button>
                        </PopoverContent>
                  </Popover>
                    ) : null}
                    {renderArchiveAlbumCover(album, hasVideoIndicator)}
                    {hasVideoIndicator ? (
                      <span className="archive-album-video-indicator" aria-hidden="true">
                        <PlayIcon className="archive-album-video-indicator-icon" />
                      </span>
                    ) : null}
                  </div>
                  <div className="archive-album-copy">
                    <div className="archive-album-title-row">
                      <strong>{album.title}</strong>
                      {album.access === "members" ? (
                        <span className="archive-album-access-indicator" title="Только для членов семьи" aria-label="Только для членов семьи">
                          <LockIcon />
                        </span>
                      ) : null}
                    </div>
                    <span>{albumContentLabel}</span>
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
            <Button type="button" variant="ghost" onClick={handleShowMore}>
              Показать еще
            </Button>
          </div>
        </div>
      ) : null}

      </>
      )}

      {archiveViewerSession && viewerMedia.length ? (
        <PersonMediaGallery
          key={`${archiveViewerSession.initialMediaId}:${archiveViewerSession.mediaIds.join(",")}`}
          media={viewerMedia}
          shareToken={shareToken}
          optimisticVideoPreviewUrls={optimisticVideoPreviewUrls}
          showStage={false}
          showStickyFooter={false}
          lightboxOnly
          openLightboxOnMount
          initialActiveMediaId={archiveViewerSession.initialMediaId}
          lightboxAriaLabelPrefix="Просмотр архива"
          onLightboxOpenChange={(open) => {
            if (!open) {
              setArchiveViewerSession(null);
            }
          }}
        />
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
            <label className="form-field">
              Доступ
              <SelectField value={editAlbumAccess} onChange={(event) => setEditAlbumAccess(event.target.value as "public" | "members")} disabled={isUpdatingAlbum}>
                <option value="members">Только для семьи</option>
                <option value="public">По ссылке</option>
              </SelectField>
            </label>
            <p className="members-static-note">
              {editAlbumAccess === "members"
                ? "Виден всем участникам семейного дерева"
                : "Любой, у кого есть ссылка, сможет открыть альбом"}
            </p>
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
              Тип альбома
              <SelectField
                value={createAlbumKind}
                onChange={(event) => setCreateAlbumKind(event.target.value as TreeMediaAlbumMediaKind)}
                disabled={mode !== "all" || isCreatingAlbum}
              >
                <option value="photo">Фото</option>
                <option value="video">Видео</option>
              </SelectField>
            </label>
            <label className="form-field">
              Доступ
              <SelectField value={createAlbumAccess} onChange={(event) => setCreateAlbumAccess(event.target.value as "public" | "members")} disabled={isCreatingAlbum}>
                <option value="members">Только для семьи</option>
                <option value="public">По ссылке</option>
              </SelectField>
            </label>
            <p className="members-static-note">
              {createAlbumAccess === "members"
                ? "Виден всем участникам семейного дерева"
                : "Любой, у кого есть ссылка, сможет открыть альбом"}
            </p>
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
            {!isReviewAlbumPinned && pendingUploadAlbumKind ? (
              <label className="form-field archive-field archive-review-field-span">
                Куда сохранить (можно выбрать альбом)
                <SelectField value={reviewAlbumId} onChange={(event) => handleReviewAlbumChange(event.target.value)}>
                  <option value="">Только в общий архив</option>
                  {reviewManualAlbums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.title}
                    </option>
                  ))}
                  <option value={CREATE_ALBUM_OPTION_VALUE}>+ Создать альбом</option>
                </SelectField>
              </label>
            ) : null}
            {!pendingUploadAlbumKind ? (
              <p className="members-static-note">
                В альбом можно сохранять только однородный набор фото или видео. Смешанные наборы и документы сохраняются только в общий архив.
              </p>
            ) : null}
            <div className="archive-review-metadata">
              {isAlbumTargetedUpload ? (
                <div className="form-field archive-field">
                  <strong>Доступ альбома</strong>
                  <p className="members-static-note">
                    {reviewTargetAlbum?.access === "members"
                      ? "Новые материалы унаследуют доступ альбома: только для семьи."
                      : "Новые материалы унаследуют доступ альбома: по ссылке."}
                  </p>
                </div>
              ) : (
                <label className="form-field archive-field">
                  Видимость
                  <SelectField value={reviewVisibility} onChange={(event) => setReviewVisibility(event.target.value as "public" | "members")}>
                    <option value="members">Только членам семьи</option>
                    <option value="public">Всем по ссылке</option>
                  </SelectField>
                </label>
              )}
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
