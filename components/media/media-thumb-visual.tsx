"use client";

import { PlayIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { buildMediaOpenRouteUrl, type MediaThumbSource } from "@/lib/tree/display";
import type { MediaAssetRecord } from "@/lib/types";

const durationLabelCache = new Map<string, string>();

function formatDurationLabel(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  const roundedDuration = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(roundedDuration / 3600);
  const minutes = Math.floor((roundedDuration % 3600) / 60);
  const seconds = roundedDuration % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface MediaThumbVisualProps {
  asset: Pick<MediaAssetRecord, "id" | "kind" | "provider" | "title">;
  thumbSource: MediaThumbSource;
  shareToken?: string | null;
  containerClassName: string;
  mediaClassName: string;
  placeholder: ReactNode;
  overlayContent?: ReactNode;
}

export function MediaThumbVisual({
  asset,
  thumbSource,
  shareToken,
  containerClassName,
  mediaClassName,
  placeholder,
  overlayContent
}: MediaThumbVisualProps) {
  const [durationLabel, setDurationLabel] = useState<string | null>(() => durationLabelCache.get(asset.id) || null);

  useEffect(() => {
    if (asset.kind !== "video" || asset.provider === "yandex_disk" || durationLabel || thumbSource?.kind === "video") {
      return;
    }

    const video = document.createElement("video");
    let active = true;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    const handleLoadedMetadata = () => {
      if (!active) {
        return;
      }

      const nextDurationLabel = formatDurationLabel(video.duration);
      if (!nextDurationLabel) {
        return;
      }

      durationLabelCache.set(asset.id, nextDurationLabel);
      setDurationLabel(nextDurationLabel);
      cleanup();
    };

    const handleError = () => {
      cleanup();
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    video.src = buildMediaOpenRouteUrl(asset, shareToken);

    return () => {
      active = false;
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      cleanup();
    };
  }, [asset, durationLabel, shareToken, thumbSource?.kind]);

  if (!thumbSource) {
    return <>{placeholder}</>;
  }

  const overlayToneClassName = asset.kind === "video" ? "media-thumb-overlay-video" : "media-thumb-overlay-photo";

  return (
    <div className={`${containerClassName} media-thumb-visual`}>
      {thumbSource.kind === "image" ? (
        <img src={thumbSource.src} alt="" loading="lazy" className={mediaClassName} />
      ) : (
        <video
          src={thumbSource.src}
          className={mediaClassName}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const nextDurationLabel = formatDurationLabel(event.currentTarget.duration);
            if (!nextDurationLabel) {
              return;
            }

            durationLabelCache.set(asset.id, nextDurationLabel);
            setDurationLabel(nextDurationLabel);
          }}
        />
      )}

      <span className={`media-thumb-overlay ${overlayToneClassName}`} aria-hidden="true" />

      {asset.kind === "video" ? (
        <>
          <span className="media-thumb-play" aria-hidden="true">
            <PlayIcon className="media-thumb-play-icon" />
          </span>
          {durationLabel ? <span className="media-thumb-duration">{durationLabel}</span> : null}
        </>
      ) : null}
      {overlayContent}
    </div>
  );
}
