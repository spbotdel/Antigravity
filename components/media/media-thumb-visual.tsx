"use client";

import { PlayIcon } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import { buildMediaOpenRouteUrl, type MediaThumbSource } from "@/lib/tree/display";
import type { MediaAssetRecord } from "@/lib/types";
import { logMediaError } from "@/lib/utils";

const MAX_DURATION_LABEL_CACHE_SIZE = 200;
const durationLabelCache = new Map<string, string>();

function isChromeAndroidVideoProbeQuirkBrowser(userAgent: string) {
  const normalized = userAgent.toLowerCase();
  return (
    normalized.includes("android") &&
    normalized.includes("chrome/") &&
    !normalized.includes("opr/") &&
    !normalized.includes("opera") &&
    !normalized.includes("edga/")
  );
}

function setDurationLabelCache(assetId: string, durationLabel: string) {
  durationLabelCache.set(assetId, durationLabel);
  if (durationLabelCache.size <= MAX_DURATION_LABEL_CACHE_SIZE) {
    return;
  }

  const oldestAssetId = durationLabelCache.keys().next().value;
  if (oldestAssetId !== undefined) {
    durationLabelCache.delete(oldestAssetId);
  }
}

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
  showToneOverlay?: boolean;
  showVideoChrome?: boolean;
  disableDurationProbe?: boolean;
  containerStyle?: CSSProperties;
  mediaStyle?: CSSProperties;
}

export function MediaThumbVisual({
  asset,
  thumbSource,
  shareToken,
  containerClassName,
  mediaClassName,
  placeholder,
  overlayContent,
  showToneOverlay = true,
  showVideoChrome = true,
  disableDurationProbe = false,
  containerStyle,
  mediaStyle
}: MediaThumbVisualProps) {
  const [durationLabel, setDurationLabel] = useState<string | null>(() => durationLabelCache.get(asset.id) || null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const shouldDisableDurationProbeForBrowser =
    typeof navigator !== "undefined" && isChromeAndroidVideoProbeQuirkBrowser(navigator.userAgent);

  useEffect(() => {
    setHasLoadError(false);
  }, [asset.id, thumbSource?.kind, thumbSource?.src]);

  useEffect(() => {
    if (
      disableDurationProbe ||
      shouldDisableDurationProbeForBrowser ||
      asset.kind !== "video" ||
      asset.provider === "yandex_disk" ||
      durationLabel ||
      thumbSource?.kind === "video"
    ) {
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

      setDurationLabelCache(asset.id, nextDurationLabel);
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
  }, [asset, disableDurationProbe, durationLabel, shareToken, shouldDisableDurationProbeForBrowser, thumbSource?.kind]);

  if (!thumbSource || hasLoadError) {
    return <>{placeholder}</>;
  }

  const overlayToneClassName = asset.kind === "video" ? "media-thumb-overlay-video" : "media-thumb-overlay-photo";
  const handleThumbLoadError = () => {
    logMediaError({
      mediaId: asset.id,
      type: "thumb",
      context: thumbSource.kind === "image" ? "MediaThumbVisual:image" : "MediaThumbVisual:video",
      src: thumbSource.src,
    });
    setHasLoadError(true);
  };

  return (
    <div className={`${containerClassName} media-thumb-visual`} style={containerStyle}>
      {thumbSource.kind === "image" ? (
        <img
          src={thumbSource.src}
          alt=""
          loading="lazy"
          className={mediaClassName}
          style={mediaStyle}
          onError={handleThumbLoadError}
        />
      ) : (
        <video
          src={thumbSource.src}
          className={mediaClassName}
          style={mediaStyle}
          muted
          playsInline
          preload="metadata"
          onError={handleThumbLoadError}
          onLoadedMetadata={(event) => {
            const nextDurationLabel = formatDurationLabel(event.currentTarget.duration);
            if (!nextDurationLabel) {
              return;
            }

            setDurationLabelCache(asset.id, nextDurationLabel);
            setDurationLabel(nextDurationLabel);
          }}
        />
      )}

      {showToneOverlay ? <span className={`media-thumb-overlay ${overlayToneClassName}`} aria-hidden="true" /> : null}

      {asset.kind === "video" && showVideoChrome ? (
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
