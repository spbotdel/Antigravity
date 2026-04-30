"use client";

import { PlayIcon } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import { buildMediaOpenRouteUrl, type MediaThumbSource, withMediaSourceContext } from "@/lib/tree/display";
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
  thumbSource: Exclude<MediaThumbSource, null>;
  shareToken?: string | null;
  containerClassName: string;
  mediaClassName: string;
  placeholder: ReactNode;
  overlayContent?: ReactNode;
  showToneOverlay?: boolean;
  showVideoChrome?: boolean;
  disableDurationProbe?: boolean;
  videoFallbackSrc?: string | null;
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
  videoFallbackSrc = null,
  containerStyle,
  mediaStyle
}: MediaThumbVisualProps) {
  const [durationLabel, setDurationLabel] = useState<string | null>(() => durationLabelCache.get(asset.id) || null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isUsingVideoFallback, setIsUsingVideoFallback] = useState(false);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  const shouldDisableDurationProbeForBrowser =
    typeof navigator !== "undefined" && isChromeAndroidVideoProbeQuirkBrowser(navigator.userAgent);
  const resolvedVideoSrc = isUsingVideoFallback && videoFallbackSrc ? videoFallbackSrc : thumbSource.kind === "video" ? thumbSource.src : null;

  useEffect(() => {
    setHasLoadError(false);
    setIsUsingVideoFallback(false);
    setIsMediaLoaded(false);
  }, [asset.id, thumbSource?.kind, thumbSource?.src, videoFallbackSrc]);

  useEffect(() => {
    if (
      disableDurationProbe ||
      shouldDisableDurationProbeForBrowser ||
      asset.kind !== "video" ||
      asset.provider === "yandex_disk" ||
      durationLabel ||
      Boolean(resolvedVideoSrc)
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
    video.src = withMediaSourceContext(
      buildMediaOpenRouteUrl(asset, shareToken),
      "media-thumb-duration-probe"
    );

    return () => {
      active = false;
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      cleanup();
    };
  }, [asset, disableDurationProbe, durationLabel, resolvedVideoSrc, shareToken, shouldDisableDurationProbeForBrowser]);

  if (!thumbSource || hasLoadError) {
    return <>{placeholder}</>;
  }

  const overlayToneClassName = asset.kind === "video" ? "media-thumb-overlay-video" : "media-thumb-overlay-photo";
  const handleThumbLoadError = () => {
    if (asset.kind === "video" && !isUsingVideoFallback && videoFallbackSrc && thumbSource.kind !== "video") {
      setIsUsingVideoFallback(true);
      return;
    }

    logMediaError({
      mediaId: asset.id,
      type: "thumb",
      context:
        asset.kind === "video" && isUsingVideoFallback
          ? "MediaThumbVisual:video-fallback"
          : thumbSource.kind === "image"
            ? "MediaThumbVisual:image"
            : "MediaThumbVisual:video",
      src: resolvedVideoSrc || thumbSource.src,
    });
    setHasLoadError(true);
  };

  return (
    <div
      className={`${containerClassName} media-thumb-visual${asset.kind === "video" ? " media-thumb-visual-video" : ""}`}
      data-media-state={isMediaLoaded ? "ready" : "loading"}
      style={containerStyle}
    >
      {asset.kind === "video" && !isMediaLoaded ? (
        <span className="media-thumb-video-loading-fallback" aria-hidden="true">
          <span className="media-thumb-video-loading-play">
            <PlayIcon className="media-thumb-play-icon" />
          </span>
        </span>
      ) : null}
      {resolvedVideoSrc ? (
        <video
          src={resolvedVideoSrc}
          className={mediaClassName}
          style={mediaStyle}
          muted
          playsInline
          preload="metadata"
          onError={handleThumbLoadError}
          onLoadedData={() => setIsMediaLoaded(true)}
          onCanPlay={() => setIsMediaLoaded(true)}
          onLoadedMetadata={(event) => {
            const nextDurationLabel = formatDurationLabel(event.currentTarget.duration);
            if (!nextDurationLabel) {
              return;
            }

            setDurationLabelCache(asset.id, nextDurationLabel);
            setDurationLabel(nextDurationLabel);
          }}
        />
      ) : thumbSource.kind === "image" ? (
        <img
          src={thumbSource.src}
          alt=""
          loading="lazy"
          className={mediaClassName}
          style={mediaStyle}
          onLoad={() => setIsMediaLoaded(true)}
          onError={handleThumbLoadError}
        />
      ) : null}

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
