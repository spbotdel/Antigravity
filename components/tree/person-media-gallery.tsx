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
import { MediaThumbVisual } from "@/components/media/media-thumb-visual";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { type CSSProperties, type ReactNode, type TouchEvent as ReactTouchEvent, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { buildMediaOpenRouteUrl, buildMediaRouteUrl, buildPhotoPreviewRouteUrl, resolveMediaThumbSource } from "@/lib/tree/display";
import { formatMediaKind, formatMediaVisibility } from "@/lib/ui-text";
import type { TreeSnapshot } from "@/lib/types";
import { logMediaError, reportMediaClientPlaybackEvent, reportMediaClientPlaybackIssue, type MediaClientPlaybackEventDiagnosticInput } from "@/lib/utils";

type MediaAsset = TreeSnapshot["media"][number];
type LightboxState = "closed" | "open" | "closing";
type LightboxGestureAxis = "undetermined" | "horizontal" | "vertical";

interface PersonMediaGalleryProps {
  media: MediaAsset[];
  shareToken?: string | null;
  optimisticVideoPreviewUrls?: Readonly<Record<string, string>>;
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
}

function isPhotoAsset(asset: MediaAsset) {
  return asset.kind === "photo";
}

function isInlineVideoAsset(asset: MediaAsset) {
  return asset.kind === "video" && asset.provider !== "yandex_disk";
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

const LIGHTBOX_STRIP_CENTER_THRESHOLD_PX = 16;
const LIGHTBOX_TRANSITION_MS = 180;
const LIGHTBOX_SWIPE_INTENT_THRESHOLD_PX = 18;
const LIGHTBOX_SWIPE_HORIZONTAL_THRESHOLD_PX = 72;
const LIGHTBOX_SWIPE_CLOSE_THRESHOLD_PX = 96;
const LIGHTBOX_SWIPE_AXIS_DOMINANCE_RATIO = 1.2;
const FULLSCREEN_CONTROLS_IDLE_MS = 2400;

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

  return Boolean(target.closest(".media-lightbox-strip-fixed, .media-lightbox-nav, .media-lightbox-close, button, a, input, textarea, select"));
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
  onSelect,
  index,
  isAvatar,
  compact = false,
  thumbRef,
  selectionControl,
  actionMenu,
  disableDurationProbe = false,
}: {
  asset: MediaAsset;
  active: boolean;
  shareToken?: string | null;
  optimisticVideoPreviewUrls?: Readonly<Record<string, string>>;
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
}) {
  const thumbSource = resolveMediaThumbSource(asset, shareToken, optimisticVideoPreviewUrls);
  const mediaUrl = thumbSource?.src || buildMediaRouteUrl(asset.id, { shareToken });
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
      {thumbSource ? (
        <MediaThumbVisual
          asset={asset}
          thumbSource={thumbSource}
          shareToken={shareToken}
          containerClassName="person-media-thumb-visual"
          mediaClassName={thumbSource.kind === "image" ? "" : "person-media-thumb-video"}
          placeholder={thumbFallback}
          overlayContent={isAvatar ? <span className="person-media-thumb-badge">Аватар</span> : null}
          disableDurationProbe={disableDurationProbe}
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
  const playResult = video.play();
  if (playResult && typeof playResult.catch === "function") {
    return playResult.catch(() => undefined);
  }

  return Promise.resolve();
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

function shouldReportPlaybackTimeline(userAgent: string) {
  const normalized = userAgent.toLowerCase();
  return normalized.includes("android") && (normalized.includes("chrome/") || normalized.includes("opr/") || normalized.includes("opera"));
}

function reportPlaybackTimelineEventForVideo(input: {
  video: HTMLVideoElement;
  mediaId: string;
  context: string;
  shareToken?: string | null;
  src?: string | null;
  poster?: string | null;
  eventName: MediaClientPlaybackEventDiagnosticInput["eventName"];
}) {
  if (typeof navigator === "undefined" || !shouldReportPlaybackTimeline(navigator.userAgent)) {
    return;
  }

  reportMediaClientPlaybackEvent({
    mediaId: input.mediaId,
    context: input.context,
    shareToken: input.shareToken,
    src: input.src || null,
    currentSrc: input.video.currentSrc || null,
    poster: input.video.poster || input.poster || null,
    errorCode: input.video.error?.code ?? null,
    networkState: input.video.networkState,
    readyState: input.video.readyState,
    currentTime: Number.isFinite(input.video.currentTime) ? input.video.currentTime : null,
    duration: Number.isFinite(input.video.duration) ? input.video.duration : null,
    controls: input.video.controls,
    playsInline: input.video.playsInline,
    autoPlay: input.video.autoplay,
    muted: input.video.muted,
    preload: input.video.preload,
    eventName: input.eventName,
  });
}

function clampPositiveSize(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function LightboxVideoPlayer({
  asset,
  src,
  poster,
  autoPlay = false,
  preferNativeControls = false,
  requireExplicitStart = false,
  shareToken,
  diagnosticContext = "PersonMediaGallery:lightbox",
  onVideoElementChange,
  onIntrinsicSizeChange,
  onError,
  shellStyle,
  surfaceStyle,
}: {
  asset: MediaAsset;
  src: string;
  poster?: string;
  autoPlay?: boolean;
  preferNativeControls?: boolean;
  requireExplicitStart?: boolean;
  shareToken?: string | null;
  diagnosticContext?: string;
  onVideoElementChange?: (node: HTMLVideoElement | null) => void;
  onIntrinsicSizeChange?: (size: { width: number; height: number } | null) => void;
  onError?: (video: HTMLVideoElement | null) => void;
  shellStyle?: CSSProperties;
  surfaceStyle?: CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isSourceAttached, setIsSourceAttached] = useState(!requireExplicitStart);
  const emitVideoElementChange = useEffectEvent((node: HTMLVideoElement | null) => {
    onVideoElementChange?.(node);
  });
  const emitIntrinsicSizeChange = useEffectEvent((size: { width: number; height: number } | null) => {
    onIntrinsicSizeChange?.(size);
  });
  const resolvedVideoSrc = isSourceAttached ? src : undefined;

  useEffect(() => {
    setIsSourceAttached(!requireExplicitStart);
  }, [asset.id, requireExplicitStart, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    emitVideoElementChange(video);
    const timelineHandlers = new Map<
      MediaClientPlaybackEventDiagnosticInput["eventName"],
      () => void
    >();

    const syncFromVideo = () => {
      setIsPlaying(!video.paused && !video.ended);
      setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setVolume(Number.isFinite(video.volume) ? video.volume : 1);
      setIsMuted(video.muted);
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        emitIntrinsicSizeChange({
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };

    syncFromVideo();

    const syncEvents = ["play", "pause", "ended", "timeupdate", "loadedmetadata", "durationchange", "volumechange"] as const;
    const timelineEvents = ["loadstart", "loadedmetadata", "canplay", "play", "playing", "waiting", "stalled", "suspend", "abort", "error"] as const;
    for (const eventName of syncEvents) {
      video.addEventListener(eventName, syncFromVideo);
    }
    for (const eventName of timelineEvents) {
      const handler = () =>
        reportPlaybackTimelineEventForVideo({
          video,
          mediaId: asset.id,
          context: diagnosticContext,
          shareToken,
          src,
          poster,
          eventName,
        });
      timelineHandlers.set(eventName, handler);
      video.addEventListener(eventName, handler);
    }

    if (autoPlay && !preferNativeControls && isSourceAttached) {
      void playVideoSafely(video);
    }

    return () => {
      video.pause();
      emitVideoElementChange(null);
      emitIntrinsicSizeChange(null);
      for (const eventName of syncEvents) {
        video.removeEventListener(eventName, syncFromVideo);
      }
      for (const eventName of timelineEvents) {
        const handler = timelineHandlers.get(eventName);
        if (handler) {
          video.removeEventListener(eventName, handler);
        }
      }
    };
  }, [asset.id, autoPlay, diagnosticContext, isSourceAttached, poster, preferNativeControls, shareToken, src]);

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

    await playVideoSafely(video);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused || video.ended) {
      await playVideoSafely(video);
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

  return (
    <div className="person-media-stage-video-frame">
      <div className="person-media-stage-video-shell" style={shellStyle}>
      <video
        ref={videoRef}
        key={`${asset.id}-lightbox`}
        src={resolvedVideoSrc}
        poster={poster}
        className="person-media-stage-video person-media-stage-video-surface"
        style={surfaceStyle}
        controls={preferNativeControls && isSourceAttached}
        playsInline
        autoPlay={preferNativeControls ? false : autoPlay}
        preload={preferNativeControls ? "none" : "metadata"}
        onError={() => onError?.(videoRef.current)}
        onClick={
          requireExplicitStart && !isSourceAttached
            ? () => {
                void handleExplicitStart();
              }
            : preferNativeControls
              ? undefined
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
      {!preferNativeControls ? (
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
      ) : null}
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
  expandedMediaShellStyle,
  expandedMediaStyle,
}: {
  asset: MediaAsset;
  shareToken?: string | null;
  optimisticVideoPreviewUrls?: Readonly<Record<string, string>>;
  expanded?: boolean;
  autoPlayVideo?: boolean;
  onLightboxVideoElementChange?: (node: HTMLVideoElement | null) => void;
  onLightboxMediaIntrinsicSizeChange?: (size: { width: number; height: number } | null) => void;
  expandedMediaShellStyle?: CSSProperties;
  expandedMediaStyle?: CSSProperties;
}) {
  const thumbSource = resolveMediaThumbSource(asset, shareToken, optimisticVideoPreviewUrls);
  const shouldPreferMetadataPreload = expanded && isInlineVideoAsset(asset);
  const [hasLoadError, setHasLoadError] = useState(false);
  const preferNativeExpandedVideoControls =
    expanded &&
    isInlineVideoAsset(asset) &&
    typeof navigator !== "undefined" &&
    isChromeAndroidVideoQuirkBrowser(navigator.userAgent);
  const mediaUrl = isPhotoAsset(asset)
    ? buildPhotoPreviewRouteUrl(asset, expanded ? "medium" : "small", shareToken)
    : buildMediaOpenRouteUrl(asset, shareToken);
  const handleOriginalLoadError = (video?: HTMLVideoElement | null) => {
    logMediaError({
      mediaId: asset.id,
      type: "original",
      context: expanded ? "PersonMediaGallery:lightbox" : "PersonMediaGallery:stage",
      src: mediaUrl,
    });
    if (asset.kind === "video") {
      if (video) {
        reportPlaybackTimelineEventForVideo({
          video,
          mediaId: asset.id,
          context: expanded ? "PersonMediaGallery:lightbox" : "PersonMediaGallery:stage",
          shareToken,
          src: mediaUrl,
          poster: video.poster || (thumbSource?.kind === "image" ? thumbSource.src : null),
          eventName: "error",
        });
      }
      reportMediaClientPlaybackIssue({
        mediaId: asset.id,
        context: expanded ? "PersonMediaGallery:lightbox" : "PersonMediaGallery:stage",
        shareToken,
        src: mediaUrl,
        currentSrc: video?.currentSrc || null,
        poster: video?.poster || (thumbSource?.kind === "image" ? thumbSource.src : null),
        errorCode: video?.error?.code ?? null,
        networkState: video?.networkState ?? null,
        readyState: video?.readyState ?? null,
        currentTime: Number.isFinite(video?.currentTime) ? video?.currentTime ?? null : null,
        duration: Number.isFinite(video?.duration) ? video?.duration ?? null : null,
        controls: video?.controls ?? null,
        playsInline: video?.playsInline ?? null,
        autoPlay: video?.autoplay ?? null,
        muted: video?.muted ?? null,
        preload: video?.preload ?? null,
      });
    }
    setHasLoadError(true);
  };

  useEffect(() => {
    setHasLoadError(false);
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
          preferNativeControls={preferNativeExpandedVideoControls}
          requireExplicitStart={preferNativeExpandedVideoControls}
          shareToken={shareToken}
          diagnosticContext="PersonMediaGallery:lightbox"
          onVideoElementChange={onLightboxVideoElementChange}
          onIntrinsicSizeChange={onLightboxMediaIntrinsicSizeChange}
          onError={handleOriginalLoadError}
          shellStyle={expandedMediaShellStyle}
          surfaceStyle={expandedMediaStyle}
        />
      );
    }

    return (
      <video
        key={`${asset.id}-${expanded ? "expanded" : "inline"}`}
        src={mediaUrl || undefined}
        poster={thumbSource?.kind === "image" ? thumbSource.src : undefined}
        className={`person-media-stage-video${expanded ? "" : " person-media-stage-video-inline"}`}
        controls
        playsInline
        muted={autoPlayVideo}
        preload="none"
        onLoadStart={(event) => reportPlaybackTimelineEventForVideo({ video: event.currentTarget, mediaId: asset.id, context: "PersonMediaGallery:stage", shareToken, src: mediaUrl, poster: thumbSource?.kind === "image" ? thumbSource.src : null, eventName: "loadstart" })}
        onLoadedMetadata={(event) => reportPlaybackTimelineEventForVideo({ video: event.currentTarget, mediaId: asset.id, context: "PersonMediaGallery:stage", shareToken, src: mediaUrl, poster: thumbSource?.kind === "image" ? thumbSource.src : null, eventName: "loadedmetadata" })}
        onCanPlay={(event) => reportPlaybackTimelineEventForVideo({ video: event.currentTarget, mediaId: asset.id, context: "PersonMediaGallery:stage", shareToken, src: mediaUrl, poster: thumbSource?.kind === "image" ? thumbSource.src : null, eventName: "canplay" })}
        onPlay={(event) => reportPlaybackTimelineEventForVideo({ video: event.currentTarget, mediaId: asset.id, context: "PersonMediaGallery:stage", shareToken, src: mediaUrl, poster: thumbSource?.kind === "image" ? thumbSource.src : null, eventName: "play" })}
        onPlaying={(event) => reportPlaybackTimelineEventForVideo({ video: event.currentTarget, mediaId: asset.id, context: "PersonMediaGallery:stage", shareToken, src: mediaUrl, poster: thumbSource?.kind === "image" ? thumbSource.src : null, eventName: "playing" })}
        onWaiting={(event) => reportPlaybackTimelineEventForVideo({ video: event.currentTarget, mediaId: asset.id, context: "PersonMediaGallery:stage", shareToken, src: mediaUrl, poster: thumbSource?.kind === "image" ? thumbSource.src : null, eventName: "waiting" })}
        onStalled={(event) => reportPlaybackTimelineEventForVideo({ video: event.currentTarget, mediaId: asset.id, context: "PersonMediaGallery:stage", shareToken, src: mediaUrl, poster: thumbSource?.kind === "image" ? thumbSource.src : null, eventName: "stalled" })}
        onSuspend={(event) => reportPlaybackTimelineEventForVideo({ video: event.currentTarget, mediaId: asset.id, context: "PersonMediaGallery:stage", shareToken, src: mediaUrl, poster: thumbSource?.kind === "image" ? thumbSource.src : null, eventName: "suspend" })}
        onAbort={(event) => reportPlaybackTimelineEventForVideo({ video: event.currentTarget, mediaId: asset.id, context: "PersonMediaGallery:stage", shareToken, src: mediaUrl, poster: thumbSource?.kind === "image" ? thumbSource.src : null, eventName: "abort" })}
        onError={(event) => handleOriginalLoadError(event.currentTarget)}
      >
        Ваш браузер не поддерживает встроенное воспроизведение видео.
      </video>
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
  const lightboxContainerRef = useRef<HTMLDivElement | null>(null);
  const lightboxContentRef = useRef<HTMLDivElement | null>(null);
  const activeLightboxVideoElementRef = useRef<HTMLVideoElement | null>(null);
  const fullscreenIdleTimeoutRef = useRef<number | null>(null);
  const fullscreenControlsPinnedRef = useRef(false);
  const isLightboxOpen = lightboxState === "open";
  const isLightboxClosing = lightboxState === "closing";
  const isLightboxRendered = lightboxState !== "closed";
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [areFullscreenControlsVisible, setAreFullscreenControlsVisible] = useState(true);
  const [lightboxContentSize, setLightboxContentSize] = useState({ width: 0, height: 0 });
  const [activeMediaIntrinsicSize, setActiveMediaIntrinsicSize] = useState<{ width: number; height: number } | null>(null);

  function openLightbox() {
    setLightboxState("open");
    onLightboxOpenChange?.(true);
  }

  function pauseActiveLightboxVideo() {
    activeLightboxVideoElementRef.current?.pause();
  }

  function closeLightbox() {
    pauseActiveLightboxVideo();
    if (document.fullscreenElement && lightboxContainerRef.current && document.fullscreenElement === lightboxContainerRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
    setLightboxState((currentState) => (currentState === "closed" ? currentState : "closing"));
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
    if (!isFullscreen || fullscreenControlsPinnedRef.current) {
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

  async function toggleFullscreen() {
    const target = lightboxContainerRef.current;
    if (!target) {
      return;
    }

    try {
      if (document.fullscreenElement === target) {
        await document.exitFullscreen();
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
      setLightboxState("closed");
      return;
    }

    if (deleteTargetMediaId && !media.some((asset) => asset.id === deleteTargetMediaId)) {
      setDeleteTargetMediaId(null);
    }
  }, [deleteTargetMediaId, media]);

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

    if (isFullscreen) {
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

  const isThumbnailStripVisible = media.length > 1 && (!isFullscreen || areFullscreenControlsVisible);
  const lightboxBottomChromeSpacePx = isFullscreen ? (isThumbnailStripVisible ? 148 : 24) : media.length > 1 ? 148 : 24;
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
    if (!expandedMediaViewport.width || !expandedMediaViewport.height) {
      return undefined;
    }

    const maxWidth = activeMediaIntrinsicSize ? Math.min(expandedMediaViewport.width, activeMediaIntrinsicSize.width) : expandedMediaViewport.width;
    const maxHeight = activeMediaIntrinsicSize ? Math.min(expandedMediaViewport.height, activeMediaIntrinsicSize.height) : expandedMediaViewport.height;

    return {
      width: "auto",
      height: "auto",
      maxWidth: `${maxWidth}px`,
      maxHeight: `${maxHeight}px`,
      objectFit: "contain",
      transition: "max-width 180ms ease, max-height 180ms ease",
    };
  }, [activeMediaIntrinsicSize, expandedMediaViewport.height, expandedMediaViewport.width]);

  const expandedMediaShellStyle = useMemo<CSSProperties | undefined>(() => {
    if (!expandedMediaViewport.width || !expandedMediaViewport.height) {
      return undefined;
    }

    return {
      maxWidth: `${expandedMediaViewport.width}px`,
      maxHeight: `${expandedMediaViewport.height}px`,
      transition: "max-width 180ms ease, max-height 180ms ease",
    };
  }, [expandedMediaViewport.height, expandedMediaViewport.width]);

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
        className={`media-lightbox media-lightbox-minimal${isLightboxClosing ? " media-lightbox-closing" : ""}${isFullscreen ? " media-lightbox-fullscreen" : ""}${isFullscreen && !areFullscreenControlsVisible ? " media-lightbox-fullscreen-idle" : ""}`}
        style={
          {
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
          if (isFullscreen) {
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
          <button
            type="button"
            className="media-lightbox-fullscreen-toggle"
            aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "Открыть в полноэкранном режиме"}
            onClick={() => void toggleFullscreen()}
            onMouseEnter={pinFullscreenControls}
            onMouseLeave={unpinFullscreenControls}
            onFocus={pinFullscreenControls}
            onBlur={unpinFullscreenControls}
          >
            {isFullscreen ? <Minimize2 className="media-lightbox-control-icon" aria-hidden="true" /> : <Maximize2 className="media-lightbox-control-icon" aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="media-lightbox-close"
            aria-label="Закрыть просмотр"
            onClick={closeLightbox}
            onMouseEnter={pinFullscreenControls}
            onMouseLeave={unpinFullscreenControls}
            onFocus={pinFullscreenControls}
            onBlur={unpinFullscreenControls}
          >
            <X className="media-lightbox-control-icon" aria-hidden="true" />
          </button>

          {canNavigate ? (
            <button
              type="button"
              className="media-lightbox-nav media-lightbox-nav-left"
              aria-label="Предыдущее медиа"
              disabled={!hasPreviousMedia}
              onClick={() => moveSelection(-1)}
              onMouseEnter={pinFullscreenControls}
              onMouseLeave={unpinFullscreenControls}
              onFocus={pinFullscreenControls}
              onBlur={unpinFullscreenControls}
            >
              <ChevronLeft className="media-lightbox-control-icon" aria-hidden="true" />
            </button>
          ) : null}

          <div ref={lightboxContentRef} className="media-lightbox-content">
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
                onLightboxMediaIntrinsicSizeChange={setActiveMediaIntrinsicSize}
                expandedMediaShellStyle={expandedMediaShellStyle}
                expandedMediaStyle={expandedMediaStyle}
              />
            </div>

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

          {canNavigate ? (
            <button
              type="button"
              className="media-lightbox-nav media-lightbox-nav-right"
              aria-label="Следующее медиа"
              disabled={!hasNextMedia}
              onClick={() => moveSelection(1)}
              onMouseEnter={pinFullscreenControls}
              onMouseLeave={unpinFullscreenControls}
              onFocus={pinFullscreenControls}
              onBlur={unpinFullscreenControls}
            >
              <ChevronRight className="media-lightbox-control-icon" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {media.length > 1 ? (
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
                onSelect={() => {
                  pauseActiveLightboxVideo();
                  setActiveMediaId(asset.id);
                }}
                index={index}
                isAvatar={asset.id === avatarMediaId && isPhotoAsset(asset)}
                compact
                disableDurationProbe={lightboxOnly}
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
        <section className="person-media-gallery">
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
            <div className="person-media-thumb-strip">
              {media.map((asset, index) => (
                <MediaThumb
                  key={asset.id}
                  asset={asset}
                  active={asset.id === activeAsset.id}
                  shareToken={shareToken}
                  optimisticVideoPreviewUrls={optimisticVideoPreviewUrls}
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
              {appendTile}
            </div>
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
