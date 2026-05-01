"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button, buttonVariants } from "@/components/ui/button";
import { MediaThumbVisual, type MediaThumbVisualLoadState } from "@/components/media/media-thumb-visual";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { type CSSProperties, type ReactNode, type TouchEvent as ReactTouchEvent, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { buildMediaOpenRouteUrl, buildMediaRouteUrl, buildPhotoPreviewRouteUrl, resolveMediaThumbSource, withMediaSourceContext } from "@/lib/tree/display";
import { formatMediaKind, formatMediaVisibility } from "@/lib/ui-text";
import type { TreeSnapshot } from "@/lib/types";
import { logMediaError } from "@/lib/utils";

type MediaAsset = TreeSnapshot["media"][number];
type LightboxState = "closed" | "open" | "closing";
type LightboxGestureAxis = "undetermined" | "horizontal" | "vertical";
type VideoStageState = "loading" | "ready" | "playing";
type LightboxVideoLayout = "standard" | "phone-lightbox";

interface PersonMediaGalleryProps {
  media: MediaAsset[];
  shareToken?: string | null;
  optimisticVideoPreviewUrls?: Readonly<Record<string, string>>;
  lightboxResolvedThumbUrlsByMediaId?: Readonly<Record<string, string>>;
  emptyMessage?: string;
  emptyTitle?: string | null;
  emptyActions?: ReactNode;
  appendTile?: ReactNode;
  avatarMediaId?: string | null;
  onSetAvatar?: (mediaId: string) => Promise<void> | void;
  canDeleteMedia?: boolean;
  onDeleteMedia?: (mediaId: string) => Promise<void>;
  showInlineMediaActions?: boolean;
  canManageInlineMediaActions?: boolean;
  getInlineMediaAlbumHref?: (asset: MediaAsset) => string | null;
  selectionMode?: boolean;
  canSelectMedia?: boolean;
  selectedMediaIds?: ReadonlySet<string>;
  onToggleMediaSelection?: (mediaId: string) => void;
  onStartMediaSelection?: (mediaId: string) => void;
  showStickyFooter?: boolean;
  showStage?: boolean;
  showViewerAvatarAction?: boolean;
  initialActiveMediaId?: string | null;
  lightboxOnly?: boolean;
  openLightboxOnMount?: boolean;
  onLightboxOpenChange?: (open: boolean) => void;
  lightboxAriaLabelPrefix?: string;
  autoPlayLightboxVideo?: boolean;
  compactPreviewEntry?: boolean;
  previewStripLimit?: number;
}

function isPhotoAsset(asset: MediaAsset) {
  return asset.kind === "photo";
}

function isInlineVideoAsset(asset: MediaAsset) {
  return asset.kind === "video" && asset.provider !== "yandex_disk";
}

function canResolveGeneratedVideoThumb(asset: MediaAsset) {
  return asset.kind === "video" && asset.provider === "cloudflare_r2" && asset.preview_status === "ready";
}

function isInlineRenderableAsset(asset: MediaAsset) {
  return isPhotoAsset(asset) || isInlineVideoAsset(asset);
}

function getMediaSourceLabel(asset: MediaAsset) {
  return asset.provider === "yandex_disk" ? "По ссылке" : "Файл";
}

function getMediaPlaceholderTitle(asset: MediaAsset) {
  if (asset.kind === "document") {
    return "Документ открывается по ссылке";
  }

  if (asset.provider === "yandex_disk") {
    return "Видео по ссылке";
  }

  return "Файл открывается по ссылке";
}

function getMediaOpenLabel(asset: MediaAsset) {
  if (asset.kind === "document") {
    return "Открыть документ";
  }

  if (asset.provider === "yandex_disk") {
    return "Открыть внешнее видео";
  }

  if (asset.kind === "video") {
    return "Открыть видео";
  }

  return "Открыть файл";
}

function getMediaStageSecondaryLabel(asset: MediaAsset) {
  return [formatMediaKind(asset.kind), formatMediaVisibility(asset.visibility), getMediaSourceLabel(asset)].join(" • ");
}

function formatGalleryMediaCount(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) {
    return `${count} материал`;
  }

  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} материала`;
  }

  return `${count} материалов`;
}

function getPreviewEntrySummary(media: MediaAsset[]) {
  const hasPhoto = media.some((asset) => asset.kind === "photo");
  const hasVideo = media.some((asset) => asset.kind === "video");

  if (hasPhoto && hasVideo) {
    return `Фото и видео • ${formatGalleryMediaCount(media.length)}`;
  }

  if (hasPhoto) {
    return `Фото • ${formatGalleryMediaCount(media.length)}`;
  }

  if (hasVideo) {
    return `Видео • ${formatGalleryMediaCount(media.length)}`;
  }

  return formatGalleryMediaCount(media.length);
}

const LIGHTBOX_STRIP_CENTER_THRESHOLD_PX = 16;
const LIGHTBOX_TRANSITION_MS = 180;
const LIGHTBOX_SWIPE_INTENT_THRESHOLD_PX = 18;
const LIGHTBOX_SWIPE_HORIZONTAL_THRESHOLD_PX = 72;
const LIGHTBOX_SWIPE_CLOSE_THRESHOLD_PX = 96;
const LIGHTBOX_SWIPE_AXIS_DOMINANCE_RATIO = 1.2;
const FULLSCREEN_CONTROLS_IDLE_MS = 2400;
const CHROME_ANDROID_VIDEO_FALLBACK_DELAY_MS = 12_000;
const LIGHTBOX_HISTORY_STATE_KEY = "__personMediaLightboxEntryId";

function createIdleLightboxGestureState() {
  return {
    tracking: false,
    ignore: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    axis: "undetermined" as LightboxGestureAxis,
  };
}

function shouldIgnoreLightboxGestureStart(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      ".media-lightbox-strip-fixed, .media-lightbox-phone-video-strip, .media-lightbox-nav, .media-lightbox-close, .person-media-stage-video-nav, button, a, input, textarea, select"
    )
  );
}

function getLightboxStripScrollTarget(container: HTMLElement, activeThumb: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const thumbRect = activeThumb.getBoundingClientRect();

  if (containerRect.width <= 0 || thumbRect.width <= 0 || container.clientWidth <= 0) {
    return null;
  }

  const thumbLeft = container.scrollLeft + (thumbRect.left - containerRect.left);
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  const activeThumbCenter = thumbLeft + thumbRect.width / 2;
  const nextScrollLeft = activeThumbCenter - container.clientWidth / 2;
  const clampedScrollLeft = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));

  return Math.abs(clampedScrollLeft - container.scrollLeft) > LIGHTBOX_STRIP_CENTER_THRESHOLD_PX ? clampedScrollLeft : null;
}

function syncLightboxStrip(container: HTMLElement | null, activeThumb: HTMLElement | null) {
  if (!container || !activeThumb) {
    return;
  }

  const nextScrollLeft = getLightboxStripScrollTarget(container, activeThumb);
  if (nextScrollLeft === null) {
    return;
  }

  container.scrollTo({ left: nextScrollLeft, behavior: "smooth" });
}

function MediaThumb({
  asset,
  active,
  shareToken,
  optimisticVideoPreviewUrls,
  lightboxResolvedThumbUrlsByMediaId,
  onSelect,
  index,
  isAvatar,
  compact = false,
  thumbRef,
  selectionControl,
  actionMenu,
  disableDurationProbe = false,
  staticVideoThumbOnly = false,
  thumbLoadStates,
  onThumbLoadStateChange,
}: {
  asset: MediaAsset;
  active: boolean;
  shareToken?: string | null;
  optimisticVideoPreviewUrls?: Readonly<Record<string, string>>;
  lightboxResolvedThumbUrlsByMediaId?: Readonly<Record<string, string>>;
  onSelect: () => void;
  index: number;
  isAvatar: boolean;
  compact?: boolean;
  thumbRef?: (node: HTMLButtonElement | null) => void;
  selectionControl?: {
    selected: boolean;
    onToggle: () => void;
  };
  actionMenu?: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    downloadHref: string;
    albumHref: string;
    showSelectAction: boolean;
    showDeleteAction: boolean;
    onStartSelection: () => void;
    onDelete: () => void;
  };
  disableDurationProbe?: boolean;
  staticVideoThumbOnly?: boolean;
  thumbLoadStates?: Readonly<Record<string, MediaThumbVisualLoadState>>;
  onThumbLoadStateChange?: (key: string, state: MediaThumbVisualLoadState) => void;
}) {
  const lightboxResolvedThumbUrl = asset.kind === "video" ? lightboxResolvedThumbUrlsByMediaId?.[asset.id] : null;
  const thumbSource = lightboxResolvedThumbUrl
    ? {
        kind: "image" as const,
        src: lightboxResolvedThumbUrl,
      }
    : resolveMediaThumbSource(asset, shareToken, optimisticVideoPreviewUrls);
  const resolvedThumbSource = thumbSource;
  const controlledThumbLoadKey =
    staticVideoThumbOnly && asset.kind === "video" && resolvedThumbSource
      ? `${asset.id}:${resolvedThumbSource.kind}:${resolvedThumbSource.src}`
      : null;
  const controlledThumbLoadState = controlledThumbLoadKey
    ? (thumbLoadStates?.[controlledThumbLoadKey] ?? "loading")
    : undefined;
  const mediaUrl = resolvedThumbSource?.src || buildMediaRouteUrl(asset.id, { shareToken });
  const thumbFallback = (
    <span className="person-media-thumb-visual">
      {asset.kind === "video" ? (
        <span
          className={`person-media-thumb-video-placeholder${compact ? " person-media-thumb-video-placeholder-compact" : ""}`}
          aria-hidden="true"
        >
          <span className="person-media-thumb-video-badge">
            <span className="person-media-thumb-video-play">▶</span>
          </span>
          <span className="person-media-thumb-video-label">Видео</span>
        </span>
      ) : (
        <span className="person-media-thumb-icon" aria-hidden="true">
          DOC
        </span>
      )}
      {isAvatar ? <span className="person-media-thumb-badge">Аватар</span> : null}
    </span>
  );

  const thumbButton = (
    <button
      type="button"
      ref={thumbRef}
      className={`person-media-thumb${active ? " person-media-thumb-active" : ""}${compact ? " person-media-thumb-compact" : ""}`}
      aria-pressed={active}
      aria-label={`Показать медиа ${index + 1}: ${asset.title}`}
      onClick={onSelect}
    >
      {resolvedThumbSource ? (
        <MediaThumbVisual
          asset={asset}
          thumbSource={resolvedThumbSource}
          shareToken={shareToken}
          containerClassName="person-media-thumb-visual"
          mediaClassName={resolvedThumbSource.kind === "image" ? "" : "person-media-thumb-video"}
          placeholder={thumbFallback}
          overlayContent={isAvatar ? <span className="person-media-thumb-badge">Аватар</span> : null}
          disableDurationProbe={disableDurationProbe}
          controlledLoadState={controlledThumbLoadState}
          onLoadStateChange={
            controlledThumbLoadKey
              ? (state) => onThumbLoadStateChange?.(controlledThumbLoadKey, state)
              : undefined
          }
        />
      ) : (
        thumbFallback
      )}
    </button>
  );

  if (!selectionControl && !actionMenu) {
    return thumbButton;
  }

  return (
    <div className={`person-media-thumb-shell${selectionControl?.selected ? " person-media-thumb-shell-selected" : ""}${compact ? " person-media-thumb-shell-compact" : ""}`}>
      {actionMenu ? (
        <Popover open={actionMenu.open} onOpenChange={actionMenu.onOpenChange}>
          <PopoverTrigger className="person-media-thumb-actions-trigger" aria-label={`Открыть действия для «${asset.title}»`}>
            ...
          </PopoverTrigger>
          <PopoverContent className="builder-media-card-actions-popover" align="end" side="bottom" sideOffset={8}>
            <a
              href={actionMenu.downloadHref}
              target="_blank"
              rel="noreferrer"
              className="builder-media-card-menu-item"
              onClick={() => actionMenu.onOpenChange(false)}
            >
              Скачать
            </a>
            <a href={actionMenu.albumHref} className="builder-media-card-menu-item" onClick={() => actionMenu.onOpenChange(false)}>
              Перейти к альбому
            </a>
            {actionMenu.showSelectAction ? (
              <button
                type="button"
                className="builder-media-card-menu-item"
                onClick={() => {
                  actionMenu.onStartSelection();
                  actionMenu.onOpenChange(false);
                }}
              >
                Выбрать несколько
              </button>
            ) : null}
            {actionMenu.showDeleteAction ? (
              <button
                type="button"
                className="builder-media-card-menu-item builder-media-card-menu-item-danger"
                onClick={() => {
                  actionMenu.onDelete();
                  actionMenu.onOpenChange(false);
                }}
              >
                Удалить
              </button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
      {selectionControl ? (
        <label className="person-media-thumb-selector">
          <input
            type="checkbox"
            className="person-media-thumb-checkbox"
            checked={selectionControl.selected}
            aria-label={`Выбрать медиа ${index + 1}: ${asset.title}`}
            onChange={() => selectionControl.onToggle()}
            onClick={(event) => event.stopPropagation()}
          />
          <span className="media-selection-indicator" aria-hidden="true">
            <span className="media-selection-checkmark">✓</span>
          </span>
        </label>
      ) : null}
      {thumbButton}
    </div>
  );
}

function formatVideoTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "0:00";
  }

  const roundedSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function playVideoSafely(video: HTMLVideoElement) {
  try {
    const playResult = video.play();
    if (playResult && typeof playResult.then === "function") {
      return playResult.then(() => true).catch(() => false);
    }

    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

function isChromeAndroidVideoQuirkBrowser(userAgent: string) {
  const normalized = userAgent.toLowerCase();
  return (
    normalized.includes("android") &&
    normalized.includes("chrome/") &&
    !normalized.includes("opr/") &&
    !normalized.includes("opera") &&
    !normalized.includes("edga/")
  );
}

function clampPositiveSize(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function readHistoryStateRecord(state: unknown) {
  if (!state || typeof state !== "object") {
    return null;
  }

  return state as Record<string, unknown>;
}

function getLightboxHistoryEntryId(state: unknown) {
  const record = readHistoryStateRecord(state);
  const entryId = record?.[LIGHTBOX_HISTORY_STATE_KEY];
  return typeof entryId === "string" ? entryId : null;
}

function isPhoneLikeViewport(width: number, height: number) {
  const shortestSide = Math.min(clampPositiveSize(width), clampPositiveSize(height));
  return shortestSide > 0 && shortestSide <= 720;
}

function resolveVideoStageState(video: HTMLVideoElement | null): VideoStageState {
  if (!video) {
    return "loading";
  }

  const hasReadyFrame = video.readyState >= 1 || video.currentTime > 0 || video.videoWidth > 0 || video.videoHeight > 0;
  if (!hasReadyFrame) {
    return "loading";
  }

  return !video.paused && !video.ended ? "playing" : "ready";
}

function LightboxVideoPlayer({
  asset,
  src,
  poster,
  autoPlay = false,
  requireExplicitStart = false,
  preload = "metadata",
  inline = false,
  onVideoElementChange,
  onIntrinsicSizeChange,
  onPlaybackReady,
  onError,
  onSurfaceTap,
  onNativeFullscreenChange,
  surfaceInteractionMode = "playback",
  layout = "standard",
  chromeVisible = true,
  stageActions = null,
  previousNavigation = null,
  nextNavigation = null,
}: {
  asset: MediaAsset;
  src: string;
  poster?: string;
  autoPlay?: boolean;
  requireExplicitStart?: boolean;
  preload?: "none" | "metadata" | "auto";
  inline?: boolean;
  onVideoElementChange?: (node: HTMLVideoElement | null) => void;
  onIntrinsicSizeChange?: (size: { width: number; height: number } | null) => void;
  onPlaybackReady?: () => void;
  onError?: (video: HTMLVideoElement | null) => void;
  onSurfaceTap?: () => void;
  onNativeFullscreenChange?: (fullscreen: boolean) => void;
  surfaceInteractionMode?: "playback" | "chrome";
  layout?: LightboxVideoLayout;
  chromeVisible?: boolean;
  stageActions?: ReactNode;
  previousNavigation?: ReactNode;
  nextNavigation?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const showPhoneLayout = layout === "phone-lightbox";
  const shouldStartMuted = showPhoneLayout && autoPlay;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(shouldStartMuted);
  const [isSourceAttached, setIsSourceAttached] = useState(!requireExplicitStart);
  const [stageState, setStageState] = useState<VideoStageState>("loading");
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [hasPlaybackEnded, setHasPlaybackEnded] = useState(false);
  const [hasAutoplayFailed, setHasAutoplayFailed] = useState(false);
  const emitVideoElementChange = useEffectEvent((node: HTMLVideoElement | null) => {
    onVideoElementChange?.(node);
  });
  const emitIntrinsicSizeChange = useEffectEvent((size: { width: number; height: number } | null) => {
    onIntrinsicSizeChange?.(size);
  });
  const emitPlaybackReady = useEffectEvent(() => {
    onPlaybackReady?.();
  });
  const emitNativeFullscreenChange = useEffectEvent((fullscreen: boolean) => {
    onNativeFullscreenChange?.(fullscreen);
  });
  const resolvedVideoSrc = isSourceAttached ? src : undefined;

  useEffect(() => {
    setIsSourceAttached(!requireExplicitStart);
  }, [asset.id, requireExplicitStart, src]);

  useEffect(() => {
    setStageState("loading");
  }, [asset.id, requireExplicitStart, src]);

  useEffect(() => {
    setHasPlaybackStarted(false);
    setHasPlaybackEnded(false);
    setHasAutoplayFailed(false);
    setIsMuted(shouldStartMuted);
  }, [asset.id, requireExplicitStart, shouldStartMuted, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    emitVideoElementChange(video);

    const syncFromVideo = (event?: Event) => {
      setIsPlaying(!video.paused && !video.ended);
      setHasPlaybackEnded(video.ended);
      setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setVolume(Number.isFinite(video.volume) ? video.volume : 1);
      setIsMuted(video.muted);
      const nextStageState = resolveVideoStageState(video);
      setStageState((currentStageState) => (currentStageState === nextStageState ? currentStageState : nextStageState));
      if (!video.ended && (!video.paused || event?.type === "play" || event?.type === "playing" || video.currentTime > 0)) {
        setHasPlaybackStarted(true);
      }
      if (event?.type === "play" || event?.type === "playing") {
        setHasAutoplayFailed(false);
      }
      if (
        event?.type === "loadedmetadata" ||
        event?.type === "canplay" ||
        event?.type === "play" ||
        event?.type === "playing" ||
        video.readyState >= 1 ||
        video.currentTime > 0
      ) {
        emitPlaybackReady();
      }
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        emitIntrinsicSizeChange({
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };

    syncFromVideo();

    const syncEvents = ["play", "pause", "ended", "timeupdate", "loadedmetadata", "durationchange", "volumechange", "canplay", "playing", "waiting", "seeking", "seeked"] as const;
    const handleNativeFullscreenBegin = () => {
      emitNativeFullscreenChange(true);
    };
    const handleNativeFullscreenEnd = () => {
      emitNativeFullscreenChange(false);
    };
    for (const eventName of syncEvents) {
      video.addEventListener(eventName, syncFromVideo);
    }
    video.addEventListener("webkitbeginfullscreen", handleNativeFullscreenBegin as EventListener);
    video.addEventListener("webkitendfullscreen", handleNativeFullscreenEnd as EventListener);

    let cancelled = false;
    if (autoPlay && isSourceAttached) {
      if (shouldStartMuted) {
        video.muted = true;
        setIsMuted(true);
      }
      void playVideoSafely(video).then((didStart) => {
        if (!cancelled && !didStart) {
          setHasAutoplayFailed(true);
        }
      });
    }

    return () => {
      cancelled = true;
      video.pause();
      emitVideoElementChange(null);
      emitIntrinsicSizeChange(null);
      for (const eventName of syncEvents) {
        video.removeEventListener(eventName, syncFromVideo);
      }
      video.removeEventListener("webkitbeginfullscreen", handleNativeFullscreenBegin as EventListener);
      video.removeEventListener("webkitendfullscreen", handleNativeFullscreenEnd as EventListener);
    };
  }, [asset.id, autoPlay, isSourceAttached, src]);

  async function handleExplicitStart() {
    const video = videoRef.current;
    setIsSourceAttached(true);

    if (!video) {
      return;
    }

    if (!video.currentSrc && !video.getAttribute("src")) {
      video.src = src;
      video.load();
    }

    setHasAutoplayFailed(false);
    const didStart = await playVideoSafely(video);
    if (!didStart) {
      setHasAutoplayFailed(true);
    }
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused || video.ended) {
      if (video.ended) {
        video.currentTime = 0;
        setCurrentTime(0);
        setHasPlaybackEnded(false);
      }
      setHasAutoplayFailed(false);
      const didStart = await playVideoSafely(video);
      if (!didStart) {
        setHasAutoplayFailed(true);
      }
      return;
    }

    video.pause();
  }

  function handleSeek(nextValue: number) {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.currentTime = nextValue;
    setCurrentTime(nextValue);
  }

  function handleVolume(nextValue: number) {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const normalizedValue = Math.max(0, Math.min(1, nextValue));
    video.volume = normalizedValue;
    video.muted = normalizedValue === 0;
    setVolume(normalizedValue);
    setIsMuted(video.muted);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.muted || video.volume === 0) {
      const restoredVolume = volume > 0 ? volume : 1;
      video.muted = false;
      video.volume = restoredVolume;
      setVolume(restoredVolume);
      setIsMuted(false);
      return;
    }

    video.muted = true;
    setIsMuted(true);
  }

  const effectiveDuration = duration > 0 ? duration : 0;
  const effectiveCurrentTime = Math.min(currentTime, effectiveDuration || 0);
  const hasPoster = Boolean(poster);
  const isPhoneStageLoading = showPhoneLayout && stageState === "loading";
  const showPhoneChrome = showPhoneLayout && chromeVisible;
  const arePhoneControlsDisabled = isPhoneStageLoading || effectiveDuration <= 0;
  const showPhonePrimaryPlayOverlay =
    showPhoneLayout &&
    !requireExplicitStart &&
    !isPlaying &&
    (!hasPlaybackStarted || hasPlaybackEnded || hasAutoplayFailed || (!hasPoster && stageState === "loading"));
  const showPhoneLoadingOverlay = isPhoneStageLoading && !showPhonePrimaryPlayOverlay;

  if (showPhoneLayout) {
    return (
      <div
        className="person-media-stage-video-frame person-media-stage-video-frame-phone"
        data-stage-state={stageState}
      >
        <div
          className="person-media-stage-video-shell person-media-stage-video-shell-phone"
          data-stage-state={stageState}
        >
          <video
            ref={videoRef}
            key={`${asset.id}-lightbox`}
            src={resolvedVideoSrc}
            poster={poster}
            className="person-media-stage-video person-media-stage-video-surface person-media-stage-video-phone-surface"
            playsInline
            muted={isMuted}
            autoPlay={autoPlay}
            preload={preload}
            onError={() => onError?.(videoRef.current)}
            onClick={
              requireExplicitStart && !isSourceAttached
                ? () => {
                    void handleExplicitStart();
                  }
                : surfaceInteractionMode === "chrome"
                  ? () => {
                      onSurfaceTap?.();
                    }
                  : () => {
                      void togglePlayback();
                    }
            }
          >
            Ваш браузер не поддерживает встроенное воспроизведение видео.
          </video>
          {showPhoneLoadingOverlay ? (
            <div className="person-media-stage-video-loading-overlay" aria-live="polite">
              <span className="person-media-stage-video-loading-chip">Загружается видео</span>
            </div>
          ) : null}
          {showPhonePrimaryPlayOverlay ? (
            <div className="person-media-stage-video-start-overlay person-media-stage-video-start-overlay-prominent">
              <button
                type="button"
                className="person-media-stage-video-start-button person-media-stage-video-play-button"
                aria-label={hasPlaybackEnded ? "Смотреть видео заново" : "Смотреть видео"}
                onClick={() => {
                  void togglePlayback();
                }}
              >
                <Play className="person-media-stage-video-control-icon" aria-hidden="true" />
                <span className="person-media-stage-video-play-button-copy">
                  <span className="person-media-stage-video-play-button-title">{hasPlaybackEnded ? "Смотреть снова" : "Смотреть видео"}</span>
                  <span className="person-media-stage-video-play-button-hint">
                    {hasPlaybackEnded ? "Запустить ролик сначала" : "Нажмите, чтобы начать"}
                  </span>
                </span>
              </button>
            </div>
          ) : null}
          {requireExplicitStart && !isSourceAttached ? (
            <div className="person-media-stage-video-start-overlay">
              <button
                type="button"
                className="person-media-stage-video-start-button"
                onClick={() => {
                  void handleExplicitStart();
                }}
              >
                <Play className="person-media-stage-video-control-icon" aria-hidden="true" />
                Загрузить видео
              </button>
            </div>
          ) : null}
          {showPhoneChrome ? <div className="person-media-stage-video-top-actions">{stageActions}</div> : null}
          {showPhoneChrome && previousNavigation ? <div className="person-media-stage-video-nav-slot person-media-stage-video-nav-slot-left">{previousNavigation}</div> : null}
          {showPhoneChrome && nextNavigation ? <div className="person-media-stage-video-nav-slot person-media-stage-video-nav-slot-right">{nextNavigation}</div> : null}
          {showPhoneChrome ? (
            <div className="person-media-stage-video-controls-anchor person-media-stage-video-controls-anchor-phone">
              <div
                className="person-media-stage-video-controls person-media-stage-video-controls-phone"
                role="group"
                aria-label={`Управление видео: ${asset.title}`}
              >
                <button
                  type="button"
                  className="person-media-stage-video-control person-media-stage-video-control-primary"
                  aria-label={isPlaying ? "Пауза" : "Воспроизвести видео"}
                  onClick={() => void togglePlayback()}
                  disabled={isPhoneStageLoading}
                >
                  {isPlaying ? <Pause className="person-media-stage-video-control-icon" aria-hidden="true" /> : <Play className="person-media-stage-video-control-icon" aria-hidden="true" />}
                </button>
                <input
                  type="range"
                  className="person-media-stage-video-slider person-media-stage-video-slider-phone"
                  aria-label="Позиция видео"
                  min={0}
                  max={effectiveDuration || 0}
                  step={0.1}
                  disabled={arePhoneControlsDisabled}
                  value={effectiveCurrentTime}
                  onChange={(event) => handleSeek(Number(event.currentTarget.value))}
                />
                <button
                  type="button"
                  className="person-media-stage-video-control"
                  aria-label={isMuted || volume === 0 ? "Включить звук" : "Выключить звук"}
                  onClick={toggleMute}
                  disabled={isPhoneStageLoading}
                >
                  {isMuted || volume === 0 ? <VolumeX className="person-media-stage-video-control-icon" aria-hidden="true" /> : <Volume2 className="person-media-stage-video-control-icon" aria-hidden="true" />}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`person-media-stage-video-frame${inline ? " person-media-stage-video-frame-inline" : ""}`}>
      <div
        className={`person-media-stage-video-shell${inline ? " person-media-stage-video-shell-inline" : ""}`}
        data-stage-state={stageState}
      >
      <video
        ref={videoRef}
        key={`${asset.id}-lightbox`}
        src={resolvedVideoSrc}
        poster={poster}
        className={`person-media-stage-video person-media-stage-video-surface${inline ? " person-media-stage-video-inline" : ""}`}
        playsInline
        muted={isMuted}
        autoPlay={autoPlay}
        preload={preload}
        onError={() => onError?.(videoRef.current)}
        onClick={
          requireExplicitStart && !isSourceAttached
            ? () => {
                void handleExplicitStart();
              }
            : surfaceInteractionMode === "chrome"
              ? () => {
                  onSurfaceTap?.();
                }
              : () => {
                  void togglePlayback();
                }
        }
      >
        Ваш браузер не поддерживает встроенное воспроизведение видео.
      </video>
      {requireExplicitStart && !isSourceAttached ? (
        <div className="person-media-stage-video-start-overlay">
          <button
            type="button"
            className="person-media-stage-video-start-button"
            onClick={() => {
              void handleExplicitStart();
            }}
          >
            <Play className="person-media-stage-video-control-icon" aria-hidden="true" />
            Загрузить видео
          </button>
        </div>
      ) : null}
      </div>
      <div className="person-media-stage-video-controls-anchor">
        <div className="person-media-stage-video-controls" role="group" aria-label={`Управление видео: ${asset.title}`}>
          <button
            type="button"
            className="person-media-stage-video-control person-media-stage-video-control-primary"
            aria-label={isPlaying ? "Пауза" : "Воспроизвести видео"}
            onClick={() => void togglePlayback()}
          >
            {isPlaying ? <Pause className="person-media-stage-video-control-icon" aria-hidden="true" /> : <Play className="person-media-stage-video-control-icon" aria-hidden="true" />}
          </button>
          <span className="person-media-stage-video-time" aria-live="off">
            {formatVideoTime(effectiveCurrentTime)} / {formatVideoTime(effectiveDuration)}
          </span>
          <input
            type="range"
            className="person-media-stage-video-slider"
            aria-label="Позиция видео"
            min={0}
            max={effectiveDuration || 0}
            step={0.1}
            disabled={effectiveDuration <= 0}
            value={effectiveCurrentTime}
            onChange={(event) => handleSeek(Number(event.currentTarget.value))}
          />
          <button
            type="button"
            className="person-media-stage-video-control"
            aria-label={isMuted || volume === 0 ? "Включить звук" : "Выключить звук"}
            onClick={toggleMute}
          >
            {isMuted || volume === 0 ? <VolumeX className="person-media-stage-video-control-icon" aria-hidden="true" /> : <Volume2 className="person-media-stage-video-control-icon" aria-hidden="true" />}
          </button>
          <input
            type="range"
            className="person-media-stage-video-slider person-media-stage-video-volume"
            aria-label="Громкость"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(event) => handleVolume(Number(event.currentTarget.value))}
          />
        </div>
      </div>
    </div>
  );
}

function MediaPreview({
  asset,
  shareToken,
  optimisticVideoPreviewUrls,
  expanded = false,
  autoPlayVideo = false,
  onLightboxVideoElementChange,
  onLightboxMediaIntrinsicSizeChange,
  expandedMediaStyle,
  surfaceInteractionMode = "playback",
  onSurfaceTap,
  onNativeFullscreenChange,
  videoLayout = "standard",
  videoChromeVisible = true,
  videoStageActions = null,
  videoPreviousNavigation = null,
  videoNextNavigation = null,
}: {
  asset: MediaAsset;
  shareToken?: string | null;
  optimisticVideoPreviewUrls?: Readonly<Record<string, string>>;
  expanded?: boolean;
  autoPlayVideo?: boolean;
  onLightboxVideoElementChange?: (node: HTMLVideoElement | null) => void;
  onLightboxMediaIntrinsicSizeChange?: (size: { width: number; height: number } | null) => void;
  expandedMediaStyle?: CSSProperties;
  surfaceInteractionMode?: "playback" | "chrome";
  onSurfaceTap?: () => void;
  onNativeFullscreenChange?: (fullscreen: boolean) => void;
  videoLayout?: LightboxVideoLayout;
  videoChromeVisible?: boolean;
  videoStageActions?: ReactNode;
  videoPreviousNavigation?: ReactNode;
  videoNextNavigation?: ReactNode;
}) {
  const thumbSource = resolveMediaThumbSource(asset, shareToken, optimisticVideoPreviewUrls);
  const [hasLoadError, setHasLoadError] = useState(false);
  const hasReachedPlayableStateRef = useRef(false);
  const delayedFallbackTimeoutRef = useRef<number | null>(null);
  const isChromeAndroidVideoBrowser =
    isInlineVideoAsset(asset) &&
    typeof navigator !== "undefined" &&
    isChromeAndroidVideoQuirkBrowser(navigator.userAgent);
  const baseMediaUrl = isPhotoAsset(asset)
    ? buildPhotoPreviewRouteUrl(asset, expanded ? "medium" : "small", shareToken)
    : buildMediaOpenRouteUrl(asset, shareToken);
  const mediaUrl = isInlineVideoAsset(asset)
    ? withMediaSourceContext(baseMediaUrl, expanded ? "person-media-lightbox-video" : "person-media-stage-video")
    : baseMediaUrl;

  function clearDelayedFallbackTimeout() {
    if (delayedFallbackTimeoutRef.current !== null) {
      window.clearTimeout(delayedFallbackTimeoutRef.current);
      delayedFallbackTimeoutRef.current = null;
    }
  }

  function markPlaybackReady() {
    hasReachedPlayableStateRef.current = true;
    clearDelayedFallbackTimeout();
  }

  const handleOriginalLoadError = (video?: HTMLVideoElement | null) => {
    logMediaError({
      mediaId: asset.id,
      type: "original",
      context: expanded ? "PersonMediaGallery:lightbox" : "PersonMediaGallery:stage",
      src: mediaUrl,
    });
    if (asset.kind === "video") {
      if (video) {
      }
    }
    if (isChromeAndroidVideoBrowser && !hasReachedPlayableStateRef.current) {
      if (delayedFallbackTimeoutRef.current === null) {
        delayedFallbackTimeoutRef.current = window.setTimeout(() => {
          delayedFallbackTimeoutRef.current = null;
          setHasLoadError(true);
        }, CHROME_ANDROID_VIDEO_FALLBACK_DELAY_MS);
      }
      return;
    }
    if (isChromeAndroidVideoBrowser && hasReachedPlayableStateRef.current) {
      return;
    }
    setHasLoadError(true);
  };

  useEffect(() => {
    setHasLoadError(false);
    hasReachedPlayableStateRef.current = false;
    clearDelayedFallbackTimeout();
    return () => {
      clearDelayedFallbackTimeout();
    };
  }, [asset.id, expanded, mediaUrl]);

  if (hasLoadError) {
    return (
      <div className="person-media-placeholder">
        <strong>Файл временно недоступен</strong>
        <p>{asset.caption || "Оригинал этого медиа сейчас недоступен, но запись в галерее сохранена."}</p>
        <a href={buildMediaOpenRouteUrl(asset, shareToken)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost" })}>
          {getMediaOpenLabel(asset)}
        </a>
      </div>
    );
  }

  if (isPhotoAsset(asset)) {
    return (
      <img
        src={mediaUrl || undefined}
        alt={asset.title}
        className={`person-media-stage-photo${expanded ? "" : " person-media-stage-photo-inline"}`}
        style={expanded ? expandedMediaStyle : undefined}
        onLoad={
          expanded
            ? (event) => {
                onLightboxMediaIntrinsicSizeChange?.({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }
            : undefined
        }
        onError={() => handleOriginalLoadError()}
      />
    );
  }

  if (isInlineVideoAsset(asset)) {
    if (expanded) {
      return (
        <LightboxVideoPlayer
          asset={asset}
          src={mediaUrl || ""}
          poster={thumbSource?.kind === "image" ? thumbSource.src : undefined}
          autoPlay={autoPlayVideo}
          requireExplicitStart={false}
          preload="metadata"
          onVideoElementChange={onLightboxVideoElementChange}
          onIntrinsicSizeChange={onLightboxMediaIntrinsicSizeChange}
          onPlaybackReady={markPlaybackReady}
          onError={handleOriginalLoadError}
          surfaceInteractionMode={surfaceInteractionMode}
          onSurfaceTap={onSurfaceTap}
          onNativeFullscreenChange={onNativeFullscreenChange}
          layout={videoLayout}
          chromeVisible={videoChromeVisible}
          stageActions={videoStageActions}
          previousNavigation={videoPreviousNavigation}
          nextNavigation={videoNextNavigation}
        />
      );
    }

    return (
      <LightboxVideoPlayer
        asset={asset}
        src={mediaUrl || ""}
        poster={thumbSource?.kind === "image" ? thumbSource.src : undefined}
        autoPlay={autoPlayVideo}
        requireExplicitStart={false}
        preload={isChromeAndroidVideoBrowser ? "metadata" : "none"}
        inline
        onPlaybackReady={markPlaybackReady}
        onError={handleOriginalLoadError}
      />
    );
  }

  return (
    <div className="person-media-placeholder">
      <strong>{getMediaPlaceholderTitle(asset)}</strong>
      <p>{asset.caption || "Этот материал открывается по отдельной ссылке."}</p>
      <a href={mediaUrl || undefined} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost" })}>
        {getMediaOpenLabel(asset)}
      </a>
    </div>
  );
}

export function PersonMediaGallery({
  media,
  shareToken,
  optimisticVideoPreviewUrls,
  lightboxResolvedThumbUrlsByMediaId,
  emptyMessage = "Для этого человека пока не добавлено медиа.",
  emptyTitle = "Галерея пока пуста",
  emptyActions = null,
  appendTile = null,
  avatarMediaId = null,
  onSetAvatar,
  canDeleteMedia = false,
  onDeleteMedia,
  showInlineMediaActions = false,
  canManageInlineMediaActions = false,
  getInlineMediaAlbumHref,
  selectionMode = false,
  canSelectMedia = false,
  selectedMediaIds,
  onToggleMediaSelection,
  onStartMediaSelection,
  showStickyFooter = true,
  showStage = true,
  showViewerAvatarAction = false,
  initialActiveMediaId = null,
  lightboxOnly = false,
  openLightboxOnMount = false,
  onLightboxOpenChange,
  lightboxAriaLabelPrefix = "Просмотр медиа",
  autoPlayLightboxVideo = true,
  compactPreviewEntry = false,
  previewStripLimit,
}: PersonMediaGalleryProps) {
  const [activeMediaId, setActiveMediaId] = useState<string | null>(() => {
    if (initialActiveMediaId && media.some((asset) => asset.id === initialActiveMediaId)) {
      return initialActiveMediaId;
    }

    return media[0]?.id ?? null;
  });
  const [lightboxState, setLightboxState] = useState<LightboxState>("closed");
  const [isAvatarUpdating, setIsAvatarUpdating] = useState(false);
  const [deleteTargetMediaId, setDeleteTargetMediaId] = useState<string | null>(null);
  const [isDeletingMedia, setIsDeletingMedia] = useState(false);
  const [openInlineActionsMediaId, setOpenInlineActionsMediaId] = useState<string | null>(null);
  const lightboxStripRef = useRef<HTMLDivElement | null>(null);
  const lightboxThumbRefs = useRef(new Map<string, HTMLButtonElement>());
  const lightboxGestureRef = useRef(createIdleLightboxGestureState());
  const pendingDeletedSuccessorIdRef = useRef<string | null>(null);
  const hasAutoOpenedLightboxRef = useRef(false);
  const lightboxHistoryEntryIdRef = useRef<string | null>(null);
  const lightboxContainerRef = useRef<HTMLDivElement | null>(null);
  const lightboxContentRef = useRef<HTMLDivElement | null>(null);
  const activeLightboxVideoElementRef = useRef<HTMLVideoElement | null>(null);
  const shouldAutoHideVideoChromeRef = useRef(false);
  const fullscreenIdleTimeoutRef = useRef<number | null>(null);
  const fullscreenControlsPinnedRef = useRef(false);
  const isLightboxOpen = lightboxState === "open";
  const isLightboxClosing = lightboxState === "closing";
  const isLightboxRendered = lightboxState !== "closed";
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [areFullscreenControlsVisible, setAreFullscreenControlsVisible] = useState(true);
  const [lightboxContentSize, setLightboxContentSize] = useState({ width: 0, height: 0 });
  const [activeMediaIntrinsicSize, setActiveMediaIntrinsicSize] = useState<{ width: number; height: number } | null>(null);
  const [isPhoneVideoSession, setIsPhoneVideoSession] = useState(false);
  const [lightboxThumbLoadStates, setLightboxThumbLoadStates] = useState<Record<string, MediaThumbVisualLoadState>>({});
  const [resolvedVideoThumbUrlsByMediaId, setResolvedVideoThumbUrlsByMediaId] = useState<Record<string, string>>({});
  const generatedVideoThumbRequest = useMemo(() => {
    const mediaIds = [...new Set(media.filter(canResolveGeneratedVideoThumb).map((asset) => asset.id))].sort();
    const treeId = media.find(canResolveGeneratedVideoThumb)?.tree_id || null;

    return {
      treeId,
      mediaIds,
      key: `${treeId || "none"}:${mediaIds.join(",")}`,
    };
  }, [media]);
  const effectiveResolvedThumbUrlsByMediaId = useMemo(
    () => ({
      ...resolvedVideoThumbUrlsByMediaId,
      ...(lightboxResolvedThumbUrlsByMediaId || {}),
    }),
    [lightboxResolvedThumbUrlsByMediaId, resolvedVideoThumbUrlsByMediaId]
  );

  function updateLightboxThumbLoadState(key: string, state: MediaThumbVisualLoadState) {
    setLightboxThumbLoadStates((currentStates) => {
      if (currentStates[key] === state) {
        return currentStates;
      }

      return {
        ...currentStates,
        [key]: state,
      };
    });
  }

  useEffect(() => {
    if (
      lightboxOnly ||
      !generatedVideoThumbRequest.treeId ||
      !generatedVideoThumbRequest.mediaIds.length ||
      typeof fetch !== "function"
    ) {
      return undefined;
    }

    const unresolvedMediaIds = generatedVideoThumbRequest.mediaIds.filter((mediaId) => !resolvedVideoThumbUrlsByMediaId[mediaId]);
    if (!unresolvedMediaIds.length) {
      return undefined;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (shareToken) {
      params.set("share", shareToken);
    }
    const requestUrl = params.size ? `/api/media/thumbs?${params.toString()}` : "/api/media/thumbs";

    void fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        treeId: generatedVideoThumbRequest.treeId,
        mediaIds: unresolvedMediaIds,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return response.json().catch(() => null) as Promise<{ urlsByMediaId?: Record<string, unknown> } | null>;
      })
      .then((payload) => {
        if (!payload?.urlsByMediaId) {
          return;
        }

        const nextUrls = Object.fromEntries(
          Object.entries(payload.urlsByMediaId).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
        );
        if (!Object.keys(nextUrls).length) {
          return;
        }

        setResolvedVideoThumbUrlsByMediaId((currentUrls) => ({
          ...currentUrls,
          ...nextUrls,
        }));
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
    };
  }, [
    generatedVideoThumbRequest.key,
    generatedVideoThumbRequest.mediaIds,
    generatedVideoThumbRequest.treeId,
    lightboxOnly,
    resolvedVideoThumbUrlsByMediaId,
    shareToken,
  ]);

  function ensureLightboxHistoryEntry() {
    if (typeof window === "undefined" || lightboxHistoryEntryIdRef.current) {
      return;
    }

    const entryId = `person-media-lightbox:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const currentState = readHistoryStateRecord(window.history.state);
    window.history.pushState(
      {
        ...(currentState ?? {}),
        [LIGHTBOX_HISTORY_STATE_KEY]: entryId,
      },
      "",
      window.location.href
    );
    lightboxHistoryEntryIdRef.current = entryId;
  }

  function restoreHistoryAfterLightboxClose() {
    const entryId = lightboxHistoryEntryIdRef.current;
    lightboxHistoryEntryIdRef.current = null;

    if (typeof window === "undefined" || !entryId) {
      return;
    }

    if (getLightboxHistoryEntryId(window.history.state) === entryId) {
      window.history.back();
    }
  }

  function openLightbox() {
    setLightboxState("open");
    onLightboxOpenChange?.(true);
  }

  function pauseActiveLightboxVideo() {
    activeLightboxVideoElementRef.current?.pause();
  }

  function beginLightboxClose() {
    pauseActiveLightboxVideo();
    if (document.fullscreenElement && lightboxContainerRef.current && document.fullscreenElement === lightboxContainerRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
    setLightboxState((currentState) => (currentState === "closed" ? currentState : "closing"));
  }

  function closeLightbox() {
    restoreHistoryAfterLightboxClose();
    beginLightboxClose();
  }

  function resetLightboxGesture() {
    lightboxGestureRef.current = createIdleLightboxGestureState();
  }

  function clearFullscreenIdleTimeout() {
    if (fullscreenIdleTimeoutRef.current !== null) {
      window.clearTimeout(fullscreenIdleTimeoutRef.current);
      fullscreenIdleTimeoutRef.current = null;
    }
  }

  function scheduleFullscreenControlsHide() {
    clearFullscreenIdleTimeout();
    if (!shouldAutoHideVideoChromeRef.current || fullscreenControlsPinnedRef.current) {
      return;
    }

    fullscreenIdleTimeoutRef.current = window.setTimeout(() => {
      if (!fullscreenControlsPinnedRef.current) {
        setAreFullscreenControlsVisible(false);
      }
    }, FULLSCREEN_CONTROLS_IDLE_MS);
  }

  function showFullscreenControls() {
    setAreFullscreenControlsVisible(true);
    scheduleFullscreenControlsHide();
  }

  function pinFullscreenControls() {
    fullscreenControlsPinnedRef.current = true;
    clearFullscreenIdleTimeout();
    setAreFullscreenControlsVisible(true);
  }

  function unpinFullscreenControls() {
    fullscreenControlsPinnedRef.current = false;
    scheduleFullscreenControlsHide();
  }

  function toggleLightboxChromeVisibility() {
    if (!shouldAutoHideVideoChromeRef.current) {
      return;
    }

    if (areFullscreenControlsVisible) {
      fullscreenControlsPinnedRef.current = false;
      clearFullscreenIdleTimeout();
      setAreFullscreenControlsVisible(false);
      return;
    }

    showFullscreenControls();
  }

  async function toggleFullscreen() {
    const target = lightboxContainerRef.current;
    if (!target) {
      return;
    }

    try {
      const activeVideo = activeLightboxVideoElementRef.current as (HTMLVideoElement & {
        webkitSupportsFullscreen?: boolean;
        webkitEnterFullscreen?: () => void;
      }) | null;
      const isPhoneLikeViewportNow =
        typeof window !== "undefined" && isPhoneLikeViewport(window.innerWidth, window.innerHeight);
      const isIphoneLikeBrowser =
        typeof navigator !== "undefined" &&
        /iPhone|iPod/i.test(navigator.userAgent) &&
        /AppleWebKit/i.test(navigator.userAgent);

      if (document.fullscreenElement === target) {
        await document.exitFullscreen();
      } else if (
        isPhoneLikeViewportNow &&
        isIphoneLikeBrowser &&
        activeVideo?.webkitSupportsFullscreen &&
        typeof activeVideo.webkitEnterFullscreen === "function"
      ) {
        setIsFullscreen(true);
        setAreFullscreenControlsVisible(true);
        activeVideo.webkitEnterFullscreen();
      } else {
        setIsFullscreen(true);
        setAreFullscreenControlsVisible(true);
        await target.requestFullscreen();
      }
    } catch {
      setIsFullscreen(false);
      // Ignore browser fullscreen rejections and keep the viewer usable.
    }
  }

  useEffect(() => {
    setActiveMediaId((currentMediaId) => {
      if (initialActiveMediaId && media.some((asset) => asset.id === initialActiveMediaId)) {
        return initialActiveMediaId;
      }

      if (currentMediaId && media.some((asset) => asset.id === currentMediaId)) {
        return currentMediaId;
      }

      const pendingSuccessorId = pendingDeletedSuccessorIdRef.current;
      if (pendingSuccessorId && media.some((asset) => asset.id === pendingSuccessorId)) {
        pendingDeletedSuccessorIdRef.current = null;
        return pendingSuccessorId;
      }

      pendingDeletedSuccessorIdRef.current = null;
      return media[0]?.id ?? null;
    });
  }, [initialActiveMediaId, media]);

  useEffect(() => {
    if (!media.length) {
      pendingDeletedSuccessorIdRef.current = null;
      setDeleteTargetMediaId(null);
      restoreHistoryAfterLightboxClose();
      setLightboxState("closed");
      return;
    }

    if (deleteTargetMediaId && !media.some((asset) => asset.id === deleteTargetMediaId)) {
      setDeleteTargetMediaId(null);
    }
  }, [deleteTargetMediaId, media]);

  useEffect(() => {
    if (!isLightboxOpen) {
      return;
    }

    ensureLightboxHistoryEntry();
  }, [isLightboxOpen]);

  useEffect(() => {
    if (!isLightboxRendered) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.classList.add("media-lightbox-open");
    document.body.style.overflow = "hidden";

    return () => {
      document.body.classList.remove("media-lightbox-open");
      document.body.style.overflow = previousOverflow;
    };
  }, [isLightboxRendered]);

  useEffect(() => {
    const content = lightboxContentRef.current;
    if (!content || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateContentSize = () => {
      const rect = content.getBoundingClientRect();
      setLightboxContentSize((currentSize) => {
        if (currentSize.width === rect.width && currentSize.height === rect.height) {
          return currentSize;
        }

        return {
          width: rect.width,
          height: rect.height,
        };
      });
    };

    updateContentSize();

    const observer = new ResizeObserver(() => {
      updateContentSize();
    });
    observer.observe(content);

    return () => {
      observer.disconnect();
    };
  }, [isFullscreen, isLightboxRendered, areFullscreenControlsVisible]);

  const handleLightboxPopState = useEffectEvent(() => {
    const entryId = lightboxHistoryEntryIdRef.current;
    if (!entryId) {
      return;
    }

    if (getLightboxHistoryEntryId(window.history.state) === entryId) {
      return;
    }

    lightboxHistoryEntryIdRef.current = null;
    beginLightboxClose();
  });

  useEffect(() => {
    function handlePopState() {
      handleLightboxPopState();
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [handleLightboxPopState]);

  useEffect(() => {
    function handleFullscreenChange() {
      const isCurrentLightboxFullscreen = Boolean(lightboxContainerRef.current && document.fullscreenElement === lightboxContainerRef.current);
      setIsFullscreen(isCurrentLightboxFullscreen);
      setAreFullscreenControlsVisible(true);
      fullscreenControlsPinnedRef.current = false;

      if (isCurrentLightboxFullscreen) {
        scheduleFullscreenControlsHide();
      } else {
        clearFullscreenIdleTimeout();
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isLightboxClosing) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      lightboxHistoryEntryIdRef.current = null;
      setLightboxState("closed");
      onLightboxOpenChange?.(false);
    }, LIGHTBOX_TRANSITION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isLightboxClosing, onLightboxOpenChange]);

  useEffect(() => {
    if (!isFullscreen) {
      clearFullscreenIdleTimeout();
      setAreFullscreenControlsVisible(true);
      return;
    }

    showFullscreenControls();
    return () => {
      clearFullscreenIdleTimeout();
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!openLightboxOnMount || hasAutoOpenedLightboxRef.current) {
      return;
    }

    hasAutoOpenedLightboxRef.current = true;
    openLightbox();
  }, [openLightboxOnMount]);

  const activeIndex = activeMediaId ? media.findIndex((asset) => asset.id === activeMediaId) : -1;
  const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeAsset = media[resolvedActiveIndex] ?? null;
  const deleteTargetAsset = deleteTargetMediaId ? media.find((asset) => asset.id === deleteTargetMediaId) ?? null : null;
  const canNavigate = media.length > 1;
  const hasPreviousMedia = resolvedActiveIndex > 0;
  const hasNextMedia = resolvedActiveIndex < media.length - 1;
  const canSetAvatar = Boolean(onSetAvatar && activeAsset && isPhotoAsset(activeAsset));
  const canDeleteCurrentMedia = Boolean(canDeleteMedia && onDeleteMedia && activeAsset && isPhotoAsset(activeAsset));
  const canSelectInlineMedia = Boolean(canSelectMedia && !showStage && selectedMediaIds && onToggleMediaSelection);
  const isInlineSelectionMode = Boolean(selectionMode && canSelectInlineMedia);
  const canShowInlineActionsMenu = Boolean(showInlineMediaActions && !showStage && !isInlineSelectionMode && getInlineMediaAlbumHref);
  const resolvedSelectedMediaIds = selectedMediaIds ?? new Set<string>();
  const resolvedToggleMediaSelection = onToggleMediaSelection ?? (() => undefined);
  const resolvedStartMediaSelection = onStartMediaSelection ?? (() => undefined);
  const resolvedInlineMediaAlbumHref = getInlineMediaAlbumHref ?? (() => null);
  const canShowInlineSelectionAction = Boolean(canManageInlineMediaActions && canSelectMedia && onStartMediaSelection);
  const canShowInlineDeleteAction = Boolean(canManageInlineMediaActions && onDeleteMedia);
  const isCompactPreviewEntry = Boolean(compactPreviewEntry && !showStage && !lightboxOnly && !isInlineSelectionMode && !canShowInlineActionsMenu);
  const resolvedPreviewStripLimit =
    isCompactPreviewEntry && previewStripLimit && Number.isFinite(previewStripLimit)
      ? Math.max(1, Math.min(media.length, Math.floor(previewStripLimit)))
      : media.length;
  const previewStripMedia = isCompactPreviewEntry ? media.slice(0, resolvedPreviewStripLimit) : media;
  const hiddenPreviewCount = Math.max(0, media.length - previewStripMedia.length);
  const previewOverflowTargetId = media[previewStripMedia.length]?.id ?? activeMediaId ?? media[0]?.id ?? null;

  useEffect(() => {
    if (!canShowInlineActionsMenu && openInlineActionsMediaId) {
      setOpenInlineActionsMediaId(null);
    }
  }, [canShowInlineActionsMenu, openInlineActionsMediaId]);

  useEffect(() => {
    if (openInlineActionsMediaId && !media.some((asset) => asset.id === openInlineActionsMediaId)) {
      setOpenInlineActionsMediaId(null);
    }
  }, [media, openInlineActionsMediaId]);

  useEffect(() => {
    setActiveMediaIntrinsicSize(null);
  }, [activeAsset?.id]);

  useEffect(() => {
    if (!isLightboxRendered || !activeAsset || !isInlineVideoAsset(activeAsset)) {
      setIsPhoneVideoSession(false);
      return;
    }

    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : lightboxContentSize.width;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : lightboxContentSize.height;
    setIsPhoneVideoSession(isPhoneLikeViewport(viewportWidth, viewportHeight));
  }, [activeAsset?.id, isLightboxRendered, lightboxContentSize.height, lightboxContentSize.width]);

  function moveSelection(direction: -1 | 1) {
    if (!media.length) {
      return false;
    }

    const nextIndex = resolvedActiveIndex + direction;
    if (nextIndex < 0 || nextIndex >= media.length) {
      return false;
    }

    pauseActiveLightboxVideo();
    setActiveMediaId(media[nextIndex].id);
    return true;
  }

  async function handleSetAvatar(mediaId: string) {
    if (!onSetAvatar || isAvatarUpdating) {
      return;
    }

    setIsAvatarUpdating(true);
    try {
      await onSetAvatar(mediaId);
    } finally {
      setIsAvatarUpdating(false);
    }
  }

  async function handleConfirmDeleteMedia() {
    if (!onDeleteMedia || !deleteTargetMediaId || isDeletingMedia) {
      return;
    }

    const currentDeleteIndex = media.findIndex((asset) => asset.id === deleteTargetMediaId);
    const nextMediaId =
      currentDeleteIndex >= 0
        ? media[currentDeleteIndex + 1]?.id ?? media[currentDeleteIndex - 1]?.id ?? null
        : null;

    pendingDeletedSuccessorIdRef.current = nextMediaId;
    setIsDeletingMedia(true);

    try {
      await onDeleteMedia(deleteTargetMediaId);
      setDeleteTargetMediaId(null);
      if (nextMediaId) {
        setActiveMediaId(nextMediaId);
      } else {
        pendingDeletedSuccessorIdRef.current = null;
        restoreHistoryAfterLightboxClose();
        setLightboxState("closed");
      }
    } catch {
      pendingDeletedSuccessorIdRef.current = null;
    } finally {
      setIsDeletingMedia(false);
    }
  }

  function renderAvatarAction() {
    if (!canSetAvatar) {
      return null;
    }

    const isCurrentAvatar = activeAsset?.id === avatarMediaId;

    return (
      <Button
        type="button"
        variant="ghost"
        className={`person-media-avatar-action${isCurrentAvatar ? " person-media-avatar-action-active" : ""}`}
        disabled={isAvatarUpdating || isCurrentAvatar}
        onClick={
          isCurrentAvatar || !activeAsset
            ? undefined
            : () => {
                void handleSetAvatar(activeAsset.id);
              }
        }
      >
        {isCurrentAvatar ? "Текущее фото профиля" : isAvatarUpdating ? "Сохраняю аватар..." : "Сделать фото профиля"}
      </Button>
    );
  }

  function handleLightboxTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if (!isLightboxOpen) {
      return;
    }

    if (isFullscreen && areFullscreenControlsVisible) {
      showFullscreenControls();
    }

    const gesture = lightboxGestureRef.current;
    Object.assign(gesture, createIdleLightboxGestureState());

    if (event.touches.length !== 1 || shouldIgnoreLightboxGestureStart(event.target)) {
      gesture.ignore = true;
      return;
    }

    const touch = event.touches[0];
    gesture.tracking = true;
    gesture.startX = touch.clientX;
    gesture.startY = touch.clientY;
    gesture.lastX = touch.clientX;
    gesture.lastY = touch.clientY;
  }

  function handleLightboxTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    const gesture = lightboxGestureRef.current;
    if (!gesture.tracking || gesture.ignore) {
      return;
    }

    if (event.touches.length !== 1) {
      resetLightboxGesture();
      return;
    }

    const touch = event.touches[0];
    gesture.lastX = touch.clientX;
    gesture.lastY = touch.clientY;

    if (gesture.axis !== "undetermined") {
      return;
    }

    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    const absoluteDeltaX = Math.abs(deltaX);
    const absoluteDeltaY = Math.abs(deltaY);

    if (Math.max(absoluteDeltaX, absoluteDeltaY) < LIGHTBOX_SWIPE_INTENT_THRESHOLD_PX) {
      return;
    }

    if (absoluteDeltaX > absoluteDeltaY * LIGHTBOX_SWIPE_AXIS_DOMINANCE_RATIO) {
      gesture.axis = "horizontal";
      return;
    }

    if (deltaY > 0 && absoluteDeltaY > absoluteDeltaX * LIGHTBOX_SWIPE_AXIS_DOMINANCE_RATIO) {
      gesture.axis = "vertical";
    }
  }

  function handleLightboxTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const gesture = lightboxGestureRef.current;
    if (!gesture.tracking || gesture.ignore) {
      resetLightboxGesture();
      return;
    }

    const touch = event.changedTouches[0];
    const endX = touch?.clientX ?? gesture.lastX;
    const endY = touch?.clientY ?? gesture.lastY;
    const deltaX = endX - gesture.startX;
    const deltaY = endY - gesture.startY;
    const absoluteDeltaX = Math.abs(deltaX);
    const absoluteDeltaY = Math.abs(deltaY);

    if (
      deltaX <= -LIGHTBOX_SWIPE_HORIZONTAL_THRESHOLD_PX &&
      absoluteDeltaX > absoluteDeltaY * LIGHTBOX_SWIPE_AXIS_DOMINANCE_RATIO
    ) {
      moveSelection(1);
      resetLightboxGesture();
      return;
    }

    if (
      deltaX >= LIGHTBOX_SWIPE_HORIZONTAL_THRESHOLD_PX &&
      absoluteDeltaX > absoluteDeltaY * LIGHTBOX_SWIPE_AXIS_DOMINANCE_RATIO
    ) {
      moveSelection(-1);
      resetLightboxGesture();
      return;
    }

    if (
      deltaY >= LIGHTBOX_SWIPE_CLOSE_THRESHOLD_PX &&
      absoluteDeltaY > absoluteDeltaX * LIGHTBOX_SWIPE_AXIS_DOMINANCE_RATIO
    ) {
      closeLightbox();
    }

    resetLightboxGesture();
  }

  useEffect(() => {
    if (!isLightboxOpen || !activeAsset) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeLightbox();
      }

      if (event.key === "ArrowLeft" && canNavigate) {
        event.preventDefault();
        moveSelection(-1);
      }

      if (event.key === "ArrowRight" && canNavigate) {
        event.preventDefault();
        moveSelection(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeAsset, canNavigate, isLightboxOpen, resolvedActiveIndex, media]);

  useEffect(() => {
    if (!isLightboxOpen || media.length <= 1 || !activeAsset) {
      return;
    }

    syncLightboxStrip(lightboxStripRef.current, lightboxThumbRefs.current.get(activeAsset.id) ?? null);
  }, [activeAsset, isLightboxOpen, media.length]);

  const effectiveLightboxViewportWidth = lightboxContentSize.width || (typeof window !== "undefined" ? window.innerWidth : 0);
  const effectiveLightboxViewportHeight = lightboxContentSize.height || (typeof window !== "undefined" ? window.innerHeight : 0);
  const isNarrowLightboxViewport = effectiveLightboxViewportWidth > 0 && effectiveLightboxViewportWidth <= 640;
  const isPhoneLightboxViewport = isPhoneLikeViewport(effectiveLightboxViewportWidth, effectiveLightboxViewportHeight);
  const isPhoneLightboxVideoMode = Boolean(activeAsset && isInlineVideoAsset(activeAsset) && (isPhoneVideoSession || isPhoneLightboxViewport));
  const shouldUseManagedVideoChrome = Boolean(activeAsset && isInlineVideoAsset(activeAsset) && (isFullscreen || isPhoneLightboxVideoMode));
  const shouldAutoHideLightboxChrome = isFullscreen || Boolean(activeAsset && isInlineVideoAsset(activeAsset) && isPhoneLightboxVideoMode);
  shouldAutoHideVideoChromeRef.current = shouldAutoHideLightboxChrome;
  const isThumbnailStripVisible = media.length > 1 && (!shouldAutoHideLightboxChrome || areFullscreenControlsVisible);
  const lightboxStripChromeSpacePx = isNarrowLightboxViewport ? 104 : 128;
  const lightboxActiveStripSpacePx = isThumbnailStripVisible ? lightboxStripChromeSpacePx : 24;
  const lightboxBottomChromeSpacePx = isFullscreen
    ? lightboxActiveStripSpacePx
    : shouldAutoHideLightboxChrome
      ? lightboxActiveStripSpacePx
      : media.length > 1
        ? lightboxStripChromeSpacePx
      : 24;
  const showLightboxActions =
    Boolean(activeAsset) &&
    (!isInlineRenderableAsset(activeAsset) || (showViewerAvatarAction && canSetAvatar) || canDeleteCurrentMedia);
  const topSafeInsetPx = isFullscreen && areFullscreenControlsVisible ? 72 : 20;
  const actionChromeInsetPx = showLightboxActions ? 72 : 0;
  const expandedMediaViewport = useMemo(() => {
    const availableWidth = clampPositiveSize(lightboxContentSize.width);
    const availableHeight = clampPositiveSize(lightboxContentSize.height - topSafeInsetPx - actionChromeInsetPx);
    return {
      width: availableWidth,
      height: availableHeight,
    };
  }, [actionChromeInsetPx, lightboxContentSize.height, lightboxContentSize.width, topSafeInsetPx]);

  const expandedMediaStyle = useMemo<CSSProperties | undefined>(() => {
    if (!expandedMediaViewport.width || !expandedMediaViewport.height || activeAsset?.kind !== "photo") {
      return undefined;
    }

    const maxWidth =
      activeMediaIntrinsicSize
        ? Math.min(expandedMediaViewport.width, activeMediaIntrinsicSize.width)
        : expandedMediaViewport.width;
    const maxHeight =
      activeMediaIntrinsicSize
        ? Math.min(expandedMediaViewport.height, activeMediaIntrinsicSize.height)
        : expandedMediaViewport.height;

    return {
      width: "auto",
      height: "auto",
      maxWidth: `${maxWidth}px`,
      maxHeight: `${maxHeight}px`,
      objectFit: "contain",
      transition: "max-width 180ms ease, max-height 180ms ease",
    };
  }, [activeAsset?.kind, activeMediaIntrinsicSize, expandedMediaViewport.height, expandedMediaViewport.width]);

  useEffect(() => {
    if (!shouldAutoHideLightboxChrome) {
      clearFullscreenIdleTimeout();
      fullscreenControlsPinnedRef.current = false;
      setAreFullscreenControlsVisible(true);
      return;
    }

    showFullscreenControls();
    return () => {
      clearFullscreenIdleTimeout();
    };
  }, [activeAsset?.id, isFullscreen, isPhoneLightboxViewport, shouldAutoHideLightboxChrome]);

  function openLightboxAtMedia(mediaId: string | null) {
    if (mediaId) {
      setActiveMediaId(mediaId);
    }
    openLightbox();
  }

  if (!media.length || !activeAsset) {
    if (lightboxOnly) {
      return null;
    }

    return (
      <section className="person-media-gallery person-media-gallery-empty">
        <div className="empty-state person-media-empty-state">
          <div className="empty-state-copy">
            {emptyTitle ? <strong>{emptyTitle}</strong> : null}
            {emptyMessage ? <p>{emptyMessage}</p> : null}
          </div>
          {emptyActions ? <div className="action-row empty-state-actions">{emptyActions}</div> : null}
        </div>
        {appendTile ? <div className="person-media-thumb-strip person-media-thumb-strip-empty">{appendTile}</div> : null}
      </section>
    );
  }

  const activeMediaUrl = buildMediaOpenRouteUrl(activeAsset, shareToken);
  const deleteConfirmDialog = Boolean(deleteTargetMediaId) ? (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isDeletingMedia) {
          setDeleteTargetMediaId(null);
        }
      }}
    >
        <DialogContent className="archive-confirm-dialog media-lightbox-confirm-dialog" aria-label="Удалить это фото?" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Удалить это фото?</DialogTitle>
            <DialogDescription>
            {deleteTargetAsset ? `Фото «${deleteTargetAsset.title}» будет удалено.` : "Фото будет удалено."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="archive-actions">
          <Button type="button" variant="ghost" disabled={isDeletingMedia} onClick={() => setDeleteTargetMediaId(null)}>
            Отмена
          </Button>
          <Button type="button" disabled={isDeletingMedia} onClick={() => void handleConfirmDeleteMedia()}>
            {isDeletingMedia ? "Удаляю..." : "Удалить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;
  const lightboxContent = isLightboxRendered ? (
    <>
      <div
        ref={lightboxContainerRef}
        className={`media-lightbox media-lightbox-minimal${isLightboxClosing ? " media-lightbox-closing" : ""}${isFullscreen ? " media-lightbox-fullscreen" : ""}${isFullscreen && !areFullscreenControlsVisible ? " media-lightbox-fullscreen-idle" : ""}${shouldUseManagedVideoChrome ? " media-lightbox-video-mode" : ""}${shouldUseManagedVideoChrome && !areFullscreenControlsVisible ? " media-lightbox-video-chrome-hidden" : ""}${isPhoneLightboxVideoMode ? " media-lightbox-phone-video-mode" : ""}${media.length > 1 ? " media-lightbox-has-strip" : ""}`}
        style={
          {
            "--media-lightbox-strip-space": `${lightboxActiveStripSpacePx}px`,
            "--media-lightbox-bottom-space": `${lightboxBottomChromeSpacePx}px`,
          } as CSSProperties
        }
        role="dialog"
        aria-modal="true"
        aria-label={`${lightboxAriaLabelPrefix}: ${activeAsset.title}`}
        onTouchStart={handleLightboxTouchStart}
        onTouchMove={handleLightboxTouchMove}
        onTouchEnd={handleLightboxTouchEnd}
        onTouchCancel={resetLightboxGesture}
        onMouseMove={() => {
          if (shouldUseManagedVideoChrome || isFullscreen) {
            showFullscreenControls();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeLightbox();
          }
        }}
      >
        <div className="media-lightbox-shell">
          <div ref={lightboxContentRef} className="media-lightbox-content">
            {isPhoneLightboxVideoMode ? (
              <div
                className="media-lightbox-phone-video-shell"
                onMouseEnter={pinFullscreenControls}
                onMouseLeave={unpinFullscreenControls}
                onFocus={pinFullscreenControls}
                onBlur={unpinFullscreenControls}
              >
                <div className="media-lightbox-phone-video-stage">
                  <MediaPreview
                    asset={activeAsset}
                    shareToken={shareToken}
                    optimisticVideoPreviewUrls={optimisticVideoPreviewUrls}
                    expanded
                    autoPlayVideo={autoPlayLightboxVideo}
                    onLightboxVideoElementChange={(node) => {
                      activeLightboxVideoElementRef.current = node;
                    }}
                    onNativeFullscreenChange={(fullscreen) => {
                      setIsFullscreen(fullscreen);
                      setAreFullscreenControlsVisible(true);
                      fullscreenControlsPinnedRef.current = false;
                      if (fullscreen) {
                        scheduleFullscreenControlsHide();
                      } else {
                        clearFullscreenIdleTimeout();
                      }
                    }}
                    onLightboxMediaIntrinsicSizeChange={setActiveMediaIntrinsicSize}
                    expandedMediaStyle={expandedMediaStyle}
                    surfaceInteractionMode="chrome"
                    onSurfaceTap={toggleLightboxChromeVisibility}
                    videoLayout="phone-lightbox"
                    videoChromeVisible={areFullscreenControlsVisible}
                    videoStageActions={
                      <>
                        <button
                          type="button"
                          className="media-lightbox-fullscreen-toggle"
                          aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "Открыть в полноэкранном режиме"}
                          onClick={() => void toggleFullscreen()}
                        >
                          {isFullscreen ? <Minimize2 className="media-lightbox-control-icon" aria-hidden="true" /> : <Maximize2 className="media-lightbox-control-icon" aria-hidden="true" />}
                        </button>
                        <button
                          type="button"
                          className="media-lightbox-close"
                          aria-label="Закрыть просмотр"
                          onClick={closeLightbox}
                        >
                          <X className="media-lightbox-control-icon" aria-hidden="true" />
                        </button>
                      </>
                    }
                    videoPreviousNavigation={
                      canNavigate ? (
                        <button
                          type="button"
                          className="person-media-stage-video-nav"
                          aria-label="Предыдущее медиа"
                          disabled={!hasPreviousMedia}
                          onClick={() => moveSelection(-1)}
                        >
                          <ChevronLeft className="media-lightbox-control-icon" aria-hidden="true" />
                        </button>
                      ) : null
                    }
                    videoNextNavigation={
                      canNavigate ? (
                        <button
                          type="button"
                          className="person-media-stage-video-nav"
                          aria-label="Следующее медиа"
                          disabled={!hasNextMedia}
                          onClick={() => moveSelection(1)}
                        >
                          <ChevronRight className="media-lightbox-control-icon" aria-hidden="true" />
                        </button>
                      ) : null
                    }
                  />
                </div>
                {media.length > 1 && areFullscreenControlsVisible ? (
                  <div
                    ref={lightboxStripRef}
                    className="media-lightbox-phone-video-strip"
                    onMouseEnter={pinFullscreenControls}
                    onMouseLeave={unpinFullscreenControls}
                    onFocus={pinFullscreenControls}
                    onBlur={unpinFullscreenControls}
                  >
                    {media.map((asset, index) => (
                      <MediaThumb
                        key={asset.id}
                        asset={asset}
                        active={asset.id === activeAsset.id}
                        shareToken={shareToken}
                        optimisticVideoPreviewUrls={optimisticVideoPreviewUrls}
                        lightboxResolvedThumbUrlsByMediaId={effectiveResolvedThumbUrlsByMediaId}
                        onSelect={() => {
                          pauseActiveLightboxVideo();
                          setActiveMediaId(asset.id);
                        }}
                        index={index}
                        isAvatar={asset.id === avatarMediaId && isPhotoAsset(asset)}
                        compact
                        disableDurationProbe={lightboxOnly}
                        staticVideoThumbOnly
                        thumbLoadStates={lightboxThumbLoadStates}
                        onThumbLoadStateChange={updateLightboxThumbLoadState}
                        thumbRef={(node) => {
                          if (node) {
                            lightboxThumbRefs.current.set(asset.id, node);
                          } else {
                            lightboxThumbRefs.current.delete(asset.id);
                          }
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={`media-lightbox-player-frame${isInlineVideoAsset(activeAsset) ? " media-lightbox-player-frame-video" : ""}`}>
                <div
                  className={`media-lightbox-player-stage${isInlineVideoAsset(activeAsset) ? " media-lightbox-player-stage-video" : ""}`}
                  onMouseEnter={pinFullscreenControls}
                  onMouseLeave={unpinFullscreenControls}
                  onFocus={pinFullscreenControls}
                  onBlur={unpinFullscreenControls}
                >
                  <div className="media-lightbox-player-toolbar">
                    <button
                      type="button"
                      className="media-lightbox-fullscreen-toggle"
                      aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "Открыть в полноэкранном режиме"}
                      onClick={() => void toggleFullscreen()}
                    >
                      {isFullscreen ? <Minimize2 className="media-lightbox-control-icon" aria-hidden="true" /> : <Maximize2 className="media-lightbox-control-icon" aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      className="media-lightbox-close"
                      aria-label="Закрыть просмотр"
                      onClick={closeLightbox}
                    >
                      <X className="media-lightbox-control-icon" aria-hidden="true" />
                    </button>
                  </div>

                  {canNavigate ? (
                    <button
                      type="button"
                      className="media-lightbox-nav media-lightbox-nav-left"
                      aria-label="Предыдущее медиа"
                      disabled={!hasPreviousMedia}
                      onClick={() => moveSelection(-1)}
                    >
                      <ChevronLeft className="media-lightbox-control-icon" aria-hidden="true" />
                    </button>
                  ) : null}

                  <div className={`media-lightbox-stage media-lightbox-stage-minimal${isInlineVideoAsset(activeAsset) ? " media-lightbox-stage-video" : ""}${isFullscreen ? " media-lightbox-stage-fullscreen" : ""}`}>
                    <MediaPreview
                      asset={activeAsset}
                      shareToken={shareToken}
                      optimisticVideoPreviewUrls={optimisticVideoPreviewUrls}
                      expanded
                      autoPlayVideo={autoPlayLightboxVideo}
                      onLightboxVideoElementChange={(node) => {
                        activeLightboxVideoElementRef.current = node;
                      }}
                      onNativeFullscreenChange={(fullscreen) => {
                        setIsFullscreen(fullscreen);
                        setAreFullscreenControlsVisible(true);
                        fullscreenControlsPinnedRef.current = false;
                        if (fullscreen) {
                          scheduleFullscreenControlsHide();
                        } else {
                          clearFullscreenIdleTimeout();
                        }
                      }}
                      onLightboxMediaIntrinsicSizeChange={setActiveMediaIntrinsicSize}
                      expandedMediaStyle={expandedMediaStyle}
                      surfaceInteractionMode={shouldUseManagedVideoChrome ? "chrome" : "playback"}
                      onSurfaceTap={toggleLightboxChromeVisibility}
                    />
                  </div>

                  {canNavigate ? (
                    <button
                      type="button"
                      className="media-lightbox-nav media-lightbox-nav-right"
                      aria-label="Следующее медиа"
                      disabled={!hasNextMedia}
                      onClick={() => moveSelection(1)}
                    >
                      <ChevronRight className="media-lightbox-control-icon" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {showLightboxActions ? (
              <div className="archive-action-bar media-lightbox-inline-actions">
                {!isInlineRenderableAsset(activeAsset) ? (
                  <a href={activeMediaUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost" })}>
                    {getMediaOpenLabel(activeAsset)}
                  </a>
                ) : null}
                {showViewerAvatarAction ? renderAvatarAction() : null}
                {canDeleteCurrentMedia ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="person-media-delete-action"
                    onClick={() => setDeleteTargetMediaId(activeAsset.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Удалить фото
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {media.length > 1 && !isPhoneLightboxVideoMode ? (
          <div
            ref={lightboxStripRef}
            className="media-lightbox-strip media-lightbox-strip-fixed"
            onMouseEnter={pinFullscreenControls}
            onMouseLeave={unpinFullscreenControls}
            onFocus={pinFullscreenControls}
            onBlur={unpinFullscreenControls}
          >
            {media.map((asset, index) => (
              <MediaThumb
                key={asset.id}
                asset={asset}
                active={asset.id === activeAsset.id}
                shareToken={shareToken}
                optimisticVideoPreviewUrls={optimisticVideoPreviewUrls}
                lightboxResolvedThumbUrlsByMediaId={effectiveResolvedThumbUrlsByMediaId}
                onSelect={() => {
                  pauseActiveLightboxVideo();
                  setActiveMediaId(asset.id);
                }}
                index={index}
                isAvatar={asset.id === avatarMediaId && isPhotoAsset(asset)}
                compact
                disableDurationProbe={lightboxOnly}
                staticVideoThumbOnly
                thumbLoadStates={lightboxThumbLoadStates}
                onThumbLoadStateChange={updateLightboxThumbLoadState}
                thumbRef={(node) => {
                  if (node) {
                    lightboxThumbRefs.current.set(asset.id, node);
                  } else {
                    lightboxThumbRefs.current.delete(asset.id);
                  }
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

    </>
  ) : null;

  return (
    <>
      {!lightboxOnly ? (
        <section className={`person-media-gallery${isCompactPreviewEntry ? " person-media-gallery-preview-entry" : ""}`}>
          {showStage ? (
            <article className="person-media-stage utility-section-card">
              <div className="person-media-stage-shell">
                <MediaPreview asset={activeAsset} shareToken={shareToken} optimisticVideoPreviewUrls={optimisticVideoPreviewUrls} />
              </div>

              <div className="person-media-stage-copy">
                <div className="media-meta">
                  <span>{formatMediaKind(activeAsset.kind)}</span>
                  <span>{formatMediaVisibility(activeAsset.visibility)}</span>
                  <span>{getMediaSourceLabel(activeAsset)}</span>
                  {activeAsset.id === avatarMediaId && isPhotoAsset(activeAsset) ? <span>Аватар</span> : null}
                </div>
                <h3>{activeAsset.title}</h3>
                {activeAsset.caption ? <p>{activeAsset.caption}</p> : <p>{isPhotoAsset(activeAsset) ? "Фотография открыта в текущей галерее и доступна для просмотра без отдельного окна." : "Материал открыт в текущей галерее и готов к просмотру или переходу по ссылке."}</p>}
              </div>

              <div className="person-media-stage-actions">
                {canNavigate ? (
                  <Button type="button" variant="ghost" size="sm" aria-label="Предыдущее медиа" disabled={!hasPreviousMedia} onClick={() => moveSelection(-1)}>
                    ‹
                  </Button>
                ) : null}
                {canNavigate ? (
                  <Button type="button" variant="ghost" size="sm" aria-label="Следующее медиа" disabled={!hasNextMedia} onClick={() => moveSelection(1)}>
                    ›
                  </Button>
                ) : null}
                {!isInlineRenderableAsset(activeAsset) ? (
                  <a href={activeMediaUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost" })}>
                    {getMediaOpenLabel(activeAsset)}
                  </a>
                ) : null}
                {renderAvatarAction()}
              </div>
            </article>
          ) : null}

          {!showStage || media.length > 1 ? (
            <>
              {isCompactPreviewEntry ? (
                <div className="person-media-preview-strip-header">
                  <div className="person-media-preview-strip-copy">
                    <strong>Галерея</strong>
                    <span>{getPreviewEntrySummary(media)}</span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="person-media-preview-strip-action" onClick={() => openLightboxAtMedia(activeMediaId)}>
                    Открыть
                  </Button>
                </div>
              ) : null}
              <div className={`person-media-thumb-strip${isCompactPreviewEntry ? " person-media-thumb-strip-entry" : ""}`}>
                {previewStripMedia.map((asset, index) => (
                  <MediaThumb
                    key={asset.id}
                    asset={asset}
                    active={!isCompactPreviewEntry && asset.id === activeAsset.id}
                    shareToken={shareToken}
                    optimisticVideoPreviewUrls={optimisticVideoPreviewUrls}
                    lightboxResolvedThumbUrlsByMediaId={effectiveResolvedThumbUrlsByMediaId}
                    onSelect={() => {
                      if (isInlineSelectionMode) {
                        resolvedToggleMediaSelection(asset.id);
                        return;
                      }
                      setActiveMediaId(asset.id);
                      if (!showStage) {
                        openLightbox();
                      }
                    }}
                    index={index}
                    isAvatar={asset.id === avatarMediaId && isPhotoAsset(asset)}
                    compact={!showStage}
                    selectionControl={
                      isInlineSelectionMode
                        ? {
                            selected: resolvedSelectedMediaIds.has(asset.id),
                            onToggle: () => resolvedToggleMediaSelection(asset.id),
                          }
                        : undefined
                    }
                    actionMenu={
                      canShowInlineActionsMenu
                        ? {
                            open: openInlineActionsMediaId === asset.id,
                            onOpenChange: (open) => setOpenInlineActionsMediaId(open ? asset.id : null),
                            downloadHref: buildMediaOpenRouteUrl(asset, shareToken),
                            albumHref: resolvedInlineMediaAlbumHref(asset) || "#",
                            showSelectAction: canShowInlineSelectionAction,
                            showDeleteAction: canShowInlineDeleteAction,
                            onStartSelection: () => resolvedStartMediaSelection(asset.id),
                            onDelete: () => setDeleteTargetMediaId(asset.id),
                          }
                        : undefined
                    }
                  />
                ))}
                {isCompactPreviewEntry && hiddenPreviewCount > 0 ? (
                  <button
                    type="button"
                    className="person-media-preview-more"
                    aria-label={`Открыть галерею и показать ещё ${hiddenPreviewCount} ${hiddenPreviewCount === 1 ? "материал" : hiddenPreviewCount < 5 ? "материала" : "материалов"}`}
                    onClick={() => openLightboxAtMedia(previewOverflowTargetId)}
                  >
                    <span className="person-media-preview-more-count">+{hiddenPreviewCount}</span>
                    <span className="person-media-preview-more-label">Открыть всё</span>
                  </button>
                ) : null}
                {appendTile}
              </div>
            </>
          ) : null}

          {showStickyFooter ? (
            <div className="archive-sticky-footer person-media-footer">
              <div className="archive-sticky-copy">
                <strong>{activeAsset.title}</strong>
                <span>{media.length} {media.length === 1 ? "материал" : media.length < 5 ? "материала" : "материалов"} в галерее</span>
              </div>
              <div className="archive-action-bar">
                <Button type="button" variant="ghost" onClick={openLightbox}>
                  Показать все
                </Button>
                {!isInlineRenderableAsset(activeAsset) ? (
                  <a href={activeMediaUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost" })}>
                    {getMediaOpenLabel(activeAsset)}
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {lightboxContent && typeof document !== "undefined" ? createPortal(lightboxContent, document.body) : null}
      {deleteConfirmDialog}
    </>
  );
}
