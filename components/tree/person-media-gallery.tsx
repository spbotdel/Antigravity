"use client";

import { useEffect, useState } from "react";

import { formatMediaKind, formatMediaVisibility } from "@/lib/ui-text";
import type { TreeSnapshot } from "@/lib/types";

type MediaAsset = TreeSnapshot["media"][number];

interface PersonMediaGalleryProps {
  media: MediaAsset[];
  shareToken?: string | null;
  emptyMessage?: string;
}

function withShareToken(url: string, shareToken?: string | null) {
  if (!shareToken) {
    return url;
  }

  const [pathname, queryString] = url.split("?");
  const params = new URLSearchParams(queryString || "");
  params.set("share", shareToken);
  const nextQueryString = params.toString();
  return nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
}

function buildMediaAssetUrl(asset: MediaAsset, shareToken?: string | null) {
  return withShareToken(`/api/media/${asset.id}`, shareToken);
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
  return asset.provider === "yandex_disk" ? "Внешняя ссылка" : "Storage";
}

function getMediaThumbBadge(asset: MediaAsset) {
  if (isPhotoAsset(asset)) {
    return "Фото";
  }

  if (asset.kind === "video" && asset.provider === "yandex_disk") {
    return "Видео по ссылке";
  }

  if (asset.kind === "video") {
    return "Видео";
  }

  return "Документ";
}

function getMediaPlaceholderTitle(asset: MediaAsset) {
  if (asset.kind === "document") {
    return "Документ доступен по ссылке";
  }

  if (asset.provider === "yandex_disk") {
    return "Внешнее видео";
  }

  return "Файл доступен по ссылке";
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
  index
}: {
  asset: MediaAsset;
  active: boolean;
  shareToken?: string | null;
  onSelect: () => void;
  index: number;
}) {
  const mediaUrl = buildMediaAssetUrl(asset, shareToken);

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
      </span>
      <span className="person-media-thumb-copy">
        <strong>{asset.title}</strong>
        <span>{getMediaThumbBadge(asset)}</span>
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
  const mediaUrl = buildMediaAssetUrl(asset, shareToken);

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
  emptyMessage = "Для этого человека пока не добавлено медиа."
}: PersonMediaGalleryProps) {
  const [activeMediaId, setActiveMediaId] = useState<string | null>(media[0]?.id ?? null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

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

  function moveSelection(direction: -1 | 1) {
    if (!media.length) {
      return;
    }

    const nextIndex = (resolvedActiveIndex + direction + media.length) % media.length;
    setActiveMediaId(media[nextIndex].id);
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
    return <div className="empty-state">{emptyMessage}</div>;
  }

  const activeMediaUrl = buildMediaAssetUrl(activeAsset, shareToken);

  return (
    <>
      <section className="person-media-gallery">
        <article className="person-media-stage">
          <div className="person-media-stage-shell">
            <MediaPreview asset={activeAsset} shareToken={shareToken} />
          </div>

          <div className="person-media-stage-copy">
            <div className="media-meta">
              <span>{formatMediaKind(activeAsset.kind)}</span>
              <span>{formatMediaVisibility(activeAsset.visibility)}</span>
              <span>{getMediaSourceLabel(activeAsset)}</span>
            </div>
            <h3>{activeAsset.title}</h3>
            <p>{activeAsset.caption || "Подпись не добавлена."}</p>
          </div>

          <div className="person-media-stage-actions">
            {canNavigate ? (
              <button type="button" className="ghost-button" onClick={() => moveSelection(-1)}>
                Предыдущее
              </button>
            ) : null}
            {canNavigate ? (
              <button type="button" className="ghost-button" onClick={() => moveSelection(1)}>
                Следующее
              </button>
            ) : null}
            {isInlineRenderableAsset(activeAsset) ? (
              <button type="button" className="ghost-button" onClick={() => setIsLightboxOpen(true)}>
                Развернуть медиа
              </button>
            ) : (
              <a href={activeMediaUrl} target="_blank" rel="noreferrer" className="ghost-button">
                {getMediaOpenLabel(activeAsset)}
              </a>
            )}
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
              />
            ))}
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
              <div className="media-lightbox-copy">
                <div className="media-meta">
                  <span>{formatMediaKind(activeAsset.kind)}</span>
                  <span>{formatMediaVisibility(activeAsset.visibility)}</span>
                  <span>{getMediaSourceLabel(activeAsset)}</span>
                </div>
                <h3>{activeAsset.title}</h3>
                <p>{activeAsset.caption || "Подпись не добавлена."}</p>
              </div>

              <div className="media-lightbox-actions">
                <a href={activeMediaUrl} target="_blank" rel="noreferrer" className="ghost-button">
                  {getMediaOpenLabel(activeAsset)}
                </a>
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
