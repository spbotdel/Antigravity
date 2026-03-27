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
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { type ReactNode, type TouchEvent as ReactTouchEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { buildMediaOpenRouteUrl, buildMediaRouteUrl, buildPhotoPreviewRouteUrl } from "@/lib/tree/display";
import { formatMediaKind, formatMediaVisibility } from "@/lib/ui-text";
import type { TreeSnapshot } from "@/lib/types";

type MediaAsset = TreeSnapshot["media"][number];
type LightboxState = "closed" | "open" | "closing";
type LightboxGestureAxis = "undetermined" | "horizontal" | "vertical";

interface PersonMediaGalleryProps {
  media: MediaAsset[];
  shareToken?: string | null;
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
  onSelect,
  index,
  isAvatar,
  compact = false,
  thumbRef,
  selectionControl,
  actionMenu,
}: {
  asset: MediaAsset;
  active: boolean;
  shareToken?: string | null;
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
}) {
  const mediaUrl = isPhotoAsset(asset)
    ? buildPhotoPreviewRouteUrl(asset, "thumb", shareToken)
    : buildMediaRouteUrl(asset.id, { shareToken });

  const thumbButton = (
    <button
      type="button"
      ref={thumbRef}
      className={`person-media-thumb${active ? " person-media-thumb-active" : ""}${compact ? " person-media-thumb-compact" : ""}`}
      aria-pressed={active}
      aria-label={`Показать медиа ${index + 1}: ${asset.title}`}
      onClick={onSelect}
    >
      <span className="person-media-thumb-visual">
        {isPhotoAsset(asset) ? (
          <img src={mediaUrl} alt="" loading="lazy" />
        ) : asset.kind === "video" ? (
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

function MediaPreview({
  asset,
  shareToken,
  expanded = false
}: {
  asset: MediaAsset;
  shareToken?: string | null;
  expanded?: boolean;
}) {
  const mediaUrl = isPhotoAsset(asset)
    ? buildPhotoPreviewRouteUrl(asset, expanded ? "medium" : "small", shareToken)
    : buildMediaOpenRouteUrl(asset, shareToken);

  if (isPhotoAsset(asset)) {
    return (
      <img
        src={mediaUrl}
        alt={asset.title}
        className={`person-media-stage-photo${expanded ? "" : " person-media-stage-photo-inline"}`}
      />
    );
  }

  if (isInlineVideoAsset(asset)) {
    return (
      <video
        key={`${asset.id}-${expanded ? "expanded" : "inline"}`}
        src={mediaUrl}
        className={`person-media-stage-video${expanded ? "" : " person-media-stage-video-inline"}`}
        controls
        playsInline
        preload="metadata"
      >
        Ваш браузер не поддерживает встроенное воспроизведение видео.
      </video>
    );
  }

  return (
    <div className="person-media-placeholder">
      <strong>{getMediaPlaceholderTitle(asset)}</strong>
      <p>{asset.caption || "Этот материал открывается по отдельной ссылке."}</p>
      <a href={mediaUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost" })}>
        {getMediaOpenLabel(asset)}
      </a>
    </div>
  );
}

export function PersonMediaGallery({
  media,
  shareToken,
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
}: PersonMediaGalleryProps) {
  const [activeMediaId, setActiveMediaId] = useState<string | null>(media[0]?.id ?? null);
  const [lightboxState, setLightboxState] = useState<LightboxState>("closed");
  const [isAvatarUpdating, setIsAvatarUpdating] = useState(false);
  const [deleteTargetMediaId, setDeleteTargetMediaId] = useState<string | null>(null);
  const [isDeletingMedia, setIsDeletingMedia] = useState(false);
  const [openInlineActionsMediaId, setOpenInlineActionsMediaId] = useState<string | null>(null);
  const lightboxStripRef = useRef<HTMLDivElement | null>(null);
  const lightboxThumbRefs = useRef(new Map<string, HTMLButtonElement>());
  const lightboxGestureRef = useRef(createIdleLightboxGestureState());
  const pendingDeletedSuccessorIdRef = useRef<string | null>(null);
  const isLightboxOpen = lightboxState === "open";
  const isLightboxClosing = lightboxState === "closing";
  const isLightboxRendered = lightboxState !== "closed";

  function openLightbox() {
    setLightboxState("open");
  }

  function closeLightbox() {
    setLightboxState((currentState) => (currentState === "closed" ? currentState : "closing"));
  }

  function resetLightboxGesture() {
    lightboxGestureRef.current = createIdleLightboxGestureState();
  }

  useEffect(() => {
    setActiveMediaId((currentMediaId) => {
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
  }, [media]);

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
    if (!isLightboxClosing) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setLightboxState("closed");
    }, LIGHTBOX_TRANSITION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isLightboxClosing]);

  const activeIndex = activeMediaId ? media.findIndex((asset) => asset.id === activeMediaId) : -1;
  const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeAsset = media[resolvedActiveIndex] ?? null;
  const deleteTargetAsset = deleteTargetMediaId ? media.find((asset) => asset.id === deleteTargetMediaId) ?? null : null;
  const canNavigate = media.length > 1;
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

  function moveSelection(direction: -1 | 1) {
    if (!media.length) {
      return;
    }

    const nextIndex = (resolvedActiveIndex + direction + media.length) % media.length;
    setActiveMediaId(media[nextIndex].id);
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

  if (!media.length || !activeAsset) {
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
  const showLightboxActions = !isInlineRenderableAsset(activeAsset) || (showViewerAvatarAction && canSetAvatar) || canDeleteCurrentMedia;
  const lightboxContent = isLightboxRendered ? (
    <>
      <div
        className={`media-lightbox media-lightbox-minimal${isLightboxClosing ? " media-lightbox-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Просмотр медиа: ${activeAsset.title}`}
        onTouchStart={handleLightboxTouchStart}
        onTouchMove={handleLightboxTouchMove}
        onTouchEnd={handleLightboxTouchEnd}
        onTouchCancel={resetLightboxGesture}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeLightbox();
          }
        }}
      >
        <div className="media-lightbox-shell">
          <button
            type="button"
            className="media-lightbox-close"
            aria-label="Закрыть просмотр"
            onClick={closeLightbox}
          >
            <X className="media-lightbox-control-icon" aria-hidden="true" />
          </button>

          {canNavigate ? (
            <button type="button" className="media-lightbox-nav media-lightbox-nav-left" aria-label="Предыдущее медиа" onClick={() => moveSelection(-1)}>
              <ChevronLeft className="media-lightbox-control-icon" aria-hidden="true" />
            </button>
          ) : null}

          <div className="media-lightbox-content">
            <div className="media-lightbox-stage media-lightbox-stage-minimal">
              <MediaPreview asset={activeAsset} shareToken={shareToken} expanded />
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
            <button type="button" className="media-lightbox-nav media-lightbox-nav-right" aria-label="Следующее медиа" onClick={() => moveSelection(1)}>
              <ChevronRight className="media-lightbox-control-icon" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {media.length > 1 ? (
          <div ref={lightboxStripRef} className="media-lightbox-strip media-lightbox-strip-fixed">
            {media.map((asset, index) => (
              <MediaThumb
                key={asset.id}
                asset={asset}
                active={asset.id === activeAsset.id}
                shareToken={shareToken}
                onSelect={() => setActiveMediaId(asset.id)}
                index={index}
                isAvatar={asset.id === avatarMediaId && isPhotoAsset(asset)}
                compact
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
      <section className="person-media-gallery">
        {showStage ? (
          <article className="person-media-stage utility-section-card">
            <div className="person-media-stage-shell">
              <MediaPreview asset={activeAsset} shareToken={shareToken} />
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
                <Button type="button" variant="ghost" size="sm" aria-label="Предыдущее медиа" onClick={() => moveSelection(-1)}>
                  ‹
                </Button>
              ) : null}
              {canNavigate ? (
                <Button type="button" variant="ghost" size="sm" aria-label="Следующее медиа" onClick={() => moveSelection(1)}>
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

      {lightboxContent && typeof document !== "undefined" ? createPortal(lightboxContent, document.body) : null}
      {deleteConfirmDialog}
    </>
  );
}
