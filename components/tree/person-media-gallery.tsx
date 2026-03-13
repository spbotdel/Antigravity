"use client";

import { type ReactNode, useEffect, useState } from "react";

import { buildMediaOpenRouteUrl, buildMediaRouteUrl, buildPhotoPreviewRouteUrl } from "@/lib/tree/display";
import { formatMediaKind, formatMediaVisibility } from "@/lib/ui-text";
import type { TreeSnapshot } from "@/lib/types";

type MediaAsset = TreeSnapshot["media"][number];

interface PersonMediaGalleryProps {
  media: MediaAsset[];
  shareToken?: string | null;
  emptyMessage?: string;
  emptyTitle?: string | null;
  emptyActions?: ReactNode;
  avatarMediaId?: string | null;
  onSetAvatar?: (mediaId: string) => Promise<void> | void;
  showStickyFooter?: boolean;
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

function MediaThumb({
  asset,
  active,
  shareToken,
  onSelect,
  index,
  isAvatar
}: {
  asset: MediaAsset;
  active: boolean;
  shareToken?: string | null;
  onSelect: () => void;
  index: number;
  isAvatar: boolean;
}) {
  const mediaUrl = isPhotoAsset(asset)
    ? buildPhotoPreviewRouteUrl(asset, "thumb", shareToken)
    : buildMediaRouteUrl(asset.id, { shareToken });

  return (
    <button
      type="button"
      className={`person-media-thumb${active ? " person-media-thumb-active" : ""}`}
      aria-pressed={active}
      aria-label={`Показать медиа ${index + 1}: ${asset.title}`}
      onClick={onSelect}
    >
      <span className="person-media-thumb-visual">
        {isPhotoAsset(asset) ? (
          <img src={mediaUrl} alt="" loading="lazy" />
        ) : (
          <span className="person-media-thumb-icon" aria-hidden="true">
            {asset.kind === "video" ? "▶" : "DOC"}
          </span>
        )}
        {isAvatar ? <span className="person-media-thumb-badge">Аватар</span> : null}
      </span>
    </button>
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
      <a href={mediaUrl} target="_blank" rel="noreferrer" className="ghost-button">
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
  avatarMediaId = null,
  onSetAvatar,
  showStickyFooter = true,
}: PersonMediaGalleryProps) {
  const [activeMediaId, setActiveMediaId] = useState<string | null>(media[0]?.id ?? null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isAvatarUpdating, setIsAvatarUpdating] = useState(false);

  useEffect(() => {
    setActiveMediaId((currentMediaId) => {
      if (currentMediaId && media.some((asset) => asset.id === currentMediaId)) {
        return currentMediaId;
      }

      return media[0]?.id ?? null;
    });
  }, [media]);

  useEffect(() => {
    if (!isLightboxOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isLightboxOpen]);

  const activeIndex = activeMediaId ? media.findIndex((asset) => asset.id === activeMediaId) : -1;
  const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeAsset = media[resolvedActiveIndex] ?? null;
  const canNavigate = media.length > 1;
  const canSetAvatar = Boolean(onSetAvatar && activeAsset && isPhotoAsset(activeAsset));

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

  useEffect(() => {
    if (!isLightboxOpen || !activeAsset) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLightboxOpen(false);
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

  if (!media.length || !activeAsset) {
    return (
      <div className="empty-state person-media-empty-state">
        <div className="empty-state-copy">
          {emptyTitle ? <strong>{emptyTitle}</strong> : null}
          {emptyMessage ? <p>{emptyMessage}</p> : null}
        </div>
        {emptyActions ? <div className="card-actions empty-state-actions">{emptyActions}</div> : null}
      </div>
    );
  }

  const activeMediaUrl = buildMediaOpenRouteUrl(activeAsset, shareToken);

  return (
    <>
      <section className="person-media-gallery">
        <article className="person-media-stage">
          <div className="person-media-stage-shell">
            <MediaPreview asset={activeAsset} shareToken={shareToken} />
          </div>

          {!isPhotoAsset(activeAsset) ? (
            <div className="person-media-stage-copy">
              <div className="media-meta">
                <span>{formatMediaKind(activeAsset.kind)}</span>
                <span>{formatMediaVisibility(activeAsset.visibility)}</span>
                <span>{getMediaSourceLabel(activeAsset)}</span>
                {activeAsset.id === avatarMediaId && isPhotoAsset(activeAsset) ? <span>Аватар</span> : null}
              </div>
              <h3>{activeAsset.title}</h3>
              {activeAsset.caption ? <p>{activeAsset.caption}</p> : null}
            </div>
          ) : null}

          <div className="person-media-stage-actions">
            {canNavigate ? (
              <button type="button" className="ghost-button ghost-button-compact" aria-label="Предыдущее медиа" onClick={() => moveSelection(-1)}>
                ‹
              </button>
            ) : null}
            {canNavigate ? (
              <button type="button" className="ghost-button ghost-button-compact" aria-label="Следующее медиа" onClick={() => moveSelection(1)}>
                ›
              </button>
            ) : null}
            {!isInlineRenderableAsset(activeAsset) ? (
              <a href={activeMediaUrl} target="_blank" rel="noreferrer" className="ghost-button">
                {getMediaOpenLabel(activeAsset)}
              </a>
            ) : null}
            {canSetAvatar ? (
              activeAsset.id === avatarMediaId ? (
                <span className="members-static-note">Текущее фото профиля</span>
              ) : (
                <button
                  type="button"
                  className="ghost-button"
                  disabled={isAvatarUpdating}
                  onClick={() => {
                    void handleSetAvatar(activeAsset.id);
                  }}
                >
                  {isAvatarUpdating ? "Сохраняю аватар..." : "Сделать фото профиля"}
                </button>
              )
            ) : null}
          </div>
        </article>

        {media.length > 1 ? (
          <div className="person-media-thumb-strip">
            {media.map((asset, index) => (
              <MediaThumb
                key={asset.id}
                asset={asset}
                active={asset.id === activeAsset.id}
                shareToken={shareToken}
                onSelect={() => setActiveMediaId(asset.id)}
                index={index}
                isAvatar={asset.id === avatarMediaId && isPhotoAsset(asset)}
              />
            ))}
          </div>
        ) : null}

        {showStickyFooter ? (
          <div className="archive-sticky-footer person-media-footer">
            <div className="archive-sticky-copy">
              <strong>{activeAsset.title}</strong>
              <span>{media.length} {media.length === 1 ? "материал" : media.length < 5 ? "материала" : "материалов"} в галерее</span>
            </div>
            <div className="archive-action-bar">
              <button type="button" className="ghost-button" onClick={() => setIsLightboxOpen(true)}>
                Показать все
              </button>
              {!isInlineRenderableAsset(activeAsset) ? (
                <a href={activeMediaUrl} target="_blank" rel="noreferrer" className="ghost-button">
                  {getMediaOpenLabel(activeAsset)}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {isLightboxOpen ? (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Просмотр медиа: ${activeAsset.title}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsLightboxOpen(false);
            }
          }}
        >
          <div className="media-lightbox-dialog">
            <div className="media-lightbox-header">
              {!isPhotoAsset(activeAsset) ? (
                <div className="media-lightbox-copy">
                  <div className="media-meta">
                    <span>{formatMediaKind(activeAsset.kind)}</span>
                    <span>{formatMediaVisibility(activeAsset.visibility)}</span>
                    <span>{getMediaSourceLabel(activeAsset)}</span>
                  </div>
                  <h3>{activeAsset.title}</h3>
                  {activeAsset.caption ? <p>{activeAsset.caption}</p> : null}
                </div>
              ) : <div />}

              <div className="media-lightbox-actions">
                <a href={activeMediaUrl} target="_blank" rel="noreferrer" className="ghost-button">
                  {getMediaOpenLabel(activeAsset)}
                </a>
                {canSetAvatar ? (
                  activeAsset.id === avatarMediaId ? (
                    <span className="members-static-note">Текущее фото профиля</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={isAvatarUpdating}
                      onClick={() => {
                        void handleSetAvatar(activeAsset.id);
                      }}
                    >
                      {isAvatarUpdating ? "Сохраняю аватар..." : "Сделать фото профиля"}
                    </button>
                  )
                ) : null}
                <button type="button" className="ghost-button" aria-label="Закрыть просмотр" onClick={() => setIsLightboxOpen(false)}>
                  Закрыть
                </button>
              </div>
            </div>

            <div className="media-lightbox-body">
              {canNavigate ? (
                <button type="button" className="media-lightbox-nav" aria-label="Предыдущее медиа" onClick={() => moveSelection(-1)}>
                  ‹
                </button>
              ) : null}

              <div className="media-lightbox-stage">
                <MediaPreview asset={activeAsset} shareToken={shareToken} expanded />
              </div>

              {canNavigate ? (
                <button type="button" className="media-lightbox-nav" aria-label="Следующее медиа" onClick={() => moveSelection(1)}>
                  ›
                </button>
              ) : null}
            </div>

            {media.length > 1 ? (
              <div className="media-lightbox-strip">
                {media.map((asset, index) => (
                  <MediaThumb
                    key={asset.id}
                    asset={asset}
                    active={asset.id === activeAsset.id}
                    shareToken={shareToken}
                    onSelect={() => setActiveMediaId(asset.id)}
                    index={index}
                    isAvatar={asset.id === avatarMediaId && isPhotoAsset(asset)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
