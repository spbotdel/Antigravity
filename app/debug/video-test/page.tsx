"use client";

import { useEffect, useMemo, useRef, useState, useEffectEvent } from "react";

import { buildMediaRouteUrl } from "@/lib/tree/display";
import { reportMediaClientPlaybackEvent, reportMediaClientPlaybackIssue } from "@/lib/utils";

const DEFAULT_DEBUG_VIDEO = {
  id: "3508fdcf-e2fc-4a34-8586-b2f503a12c7c",
  title: "Урок №1 (Telegram).mp4",
};

interface VideoEventEntry {
  id: number;
  name: string;
  detail: string;
  timestamp: string;
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "-";
}

function formatDuration(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}s` : "-";
}

function buildVideoStateDetail(video: HTMLVideoElement) {
  return [
    `readyState=${formatNumber(video.readyState)}`,
    `networkState=${formatNumber(video.networkState)}`,
    `currentTime=${formatDuration(video.currentTime)}`,
    `duration=${formatDuration(video.duration)}`,
    `currentSrc=${video.currentSrc || "-"}`,
  ].join(" ");
}

export default function DebugVideoTestPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const eventIdRef = useRef(0);
  const [mediaIdInput, setMediaIdInput] = useState(DEFAULT_DEBUG_VIDEO.id);
  const [shareInput, setShareInput] = useState("");
  const mediaId = mediaIdInput.trim();
  const shareToken = shareInput.trim() || null;
  const sourceUrl = useMemo(() => {
    if (!mediaId) {
      return "";
    }

    return buildMediaRouteUrl(mediaId, { shareToken });
  }, [mediaId, shareToken]);
  const [eventLog, setEventLog] = useState<VideoEventEntry[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const diagnosticContext = "DebugVideoTestPage:native-video";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setMediaIdInput(params.get("mediaId") || DEFAULT_DEBUG_VIDEO.id);
    setShareInput(params.get("share") || "");
  }, []);

  const appendEvent = useEffectEvent((name: string, detail: string) => {
    eventIdRef.current += 1;
    setEventLog((currentLog) => [
      {
        id: eventIdRef.current,
        name,
        detail,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...currentLog,
    ]);
  });

  useEffect(() => {
    setEventLog([]);
    setLastError(null);
    eventIdRef.current = 0;
  }, [sourceUrl]);

  const reportTimelineEvent = useEffectEvent((eventName: "loadstart" | "loadedmetadata" | "canplay" | "play" | "playing" | "waiting" | "stalled" | "suspend" | "abort" | "error", video: HTMLVideoElement) => {
    reportMediaClientPlaybackEvent({
      mediaId,
      context: diagnosticContext,
      shareToken,
      src: sourceUrl || null,
      currentSrc: video.currentSrc || null,
      poster: video.poster || null,
      errorCode: video.error?.code ?? null,
      networkState: video.networkState,
      readyState: video.readyState,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      controls: video.controls,
      playsInline: video.playsInline,
      autoPlay: video.autoplay,
      muted: video.muted,
      preload: video.preload,
      eventName,
    });
  });

  const logTimelineEvent = useEffectEvent((eventName: "loadstart" | "loadedmetadata" | "canplay" | "play" | "playing" | "waiting" | "stalled" | "suspend" | "abort" | "error", video: HTMLVideoElement) => {
    appendEvent(eventName, buildVideoStateDetail(video));
    if (mediaId) {
      reportTimelineEvent(eventName, video);
    }
  });

  const handleLoadedMetadata = useEffectEvent((video: HTMLVideoElement) => {
    appendEvent(
      "loadedmetadata",
      `duration=${formatDuration(video.duration)} width=${formatNumber(video.videoWidth)} height=${formatNumber(video.videoHeight)} readyState=${formatNumber(video.readyState)}`
    );
    if (mediaId) {
      reportTimelineEvent("loadedmetadata", video);
    }
  });

  const handleCanPlay = useEffectEvent((video: HTMLVideoElement) => {
    logTimelineEvent("canplay", video);
  });

  const handlePlay = useEffectEvent((video: HTMLVideoElement) => {
    logTimelineEvent("play", video);
  });

  const handleError = useEffectEvent((video: HTMLVideoElement) => {
    const message = [
      `code=${formatNumber(video.error?.code)}`,
      `message=${video.error?.message || "-"}`,
      `networkState=${formatNumber(video.networkState)}`,
      `readyState=${formatNumber(video.readyState)}`,
      `currentSrc=${video.currentSrc || "-"}`,
    ].join(" ");

    setLastError(message);
    appendEvent("error", message);
    if (mediaId) {
      reportTimelineEvent("error", video);
      reportMediaClientPlaybackIssue({
        mediaId,
        context: diagnosticContext,
        shareToken,
        src: sourceUrl || null,
        currentSrc: video.currentSrc || null,
        poster: video.poster || null,
        errorCode: video.error?.code ?? null,
        networkState: video.networkState,
        readyState: video.readyState,
        currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
        duration: Number.isFinite(video.duration) ? video.duration : null,
        controls: video.controls,
        playsInline: video.playsInline,
        autoPlay: video.autoplay,
        muted: video.muted,
        preload: video.preload,
      });
    }
  });

  return (
    <main style={{ margin: "0 auto", maxWidth: 960, padding: "32px 20px 64px" }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Temporary diagnostic route</p>
        <h1 style={{ margin: "8px 0 12px", fontSize: 32, lineHeight: 1.1 }}>Minimal Video Test</h1>
        <p style={{ margin: 0, maxWidth: 720, color: "#374151", lineHeight: 1.6 }}>
          This page isolates one asset behind a plain native HTML5 video element. It keeps the same media route the app uses and removes gallery,
          lightbox, custom controls, and fullscreen shell logic from the test surface.
        </p>
        <p style={{ margin: "12px 0 0", color: "#374151", lineHeight: 1.6 }}>
          Default test asset: <strong>{DEFAULT_DEBUG_VIDEO.title}</strong>
        </p>
      </header>

      <section
        style={{
          marginBottom: 24,
          border: "1px solid #d1d5db",
          borderRadius: 16,
          padding: 16,
          background: "#f9fafb",
        }}
      >
        <form method="get" style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>mediaId</span>
            <input
              type="text"
              name="mediaId"
              value={mediaIdInput}
              placeholder={DEFAULT_DEBUG_VIDEO.id}
              onChange={(event) => setMediaIdInput(event.currentTarget.value)}
              style={{ border: "1px solid #9ca3af", borderRadius: 10, padding: "10px 12px", font: "inherit" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>share token (optional)</span>
            <input
              type="text"
              name="share"
              value={shareInput}
              placeholder="Use only if you need share-link access"
              onChange={(event) => setShareInput(event.currentTarget.value)}
              style={{ border: "1px solid #9ca3af", borderRadius: 10, padding: "10px 12px", font: "inherit" }}
            />
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="submit"
              style={{
                border: "none",
                borderRadius: 999,
                background: "#111827",
                color: "#ffffff",
                padding: "10px 16px",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              Open test
            </button>
            <a
              href={`/debug/video-test?mediaId=${encodeURIComponent(DEFAULT_DEBUG_VIDEO.id)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                border: "1px solid #9ca3af",
                color: "#111827",
                padding: "10px 16px",
                textDecoration: "none",
              }}
            >
              Open default video
            </a>
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  border: "1px solid #9ca3af",
                  color: "#111827",
                  padding: "10px 16px",
                  textDecoration: "none",
                }}
              >
                Open source directly
              </a>
            ) : null}
          </div>
        </form>
      </section>

      <section
        style={{
          marginBottom: 24,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          background: "#ffffff",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Diagnostic info</h2>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(140px, 200px) 1fr",
            gap: 10,
            alignItems: "start",
          }}
        >
          <dt style={{ fontWeight: 600 }}>mediaId</dt>
          <dd style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{mediaId || "-"}</dd>
          <dt style={{ fontWeight: 600 }}>default asset</dt>
          <dd style={{ margin: 0 }}>{DEFAULT_DEBUG_VIDEO.title}</dd>
          <dt style={{ fontWeight: 600 }}>source</dt>
          <dd style={{ margin: 0, wordBreak: "break-all", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{sourceUrl || "-"}</dd>
          <dt style={{ fontWeight: 600 }}>log context</dt>
          <dd style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{diagnosticContext}</dd>
          <dt style={{ fontWeight: 600 }}>last error</dt>
          <dd style={{ margin: 0, wordBreak: "break-word", color: lastError ? "#b91c1c" : "#6b7280" }}>{lastError || "No error captured yet."}</dd>
        </dl>
      </section>

      <section
        style={{
          marginBottom: 24,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          background: "#ffffff",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Native HTML5 video</h2>
        {sourceUrl ? (
          <video
            ref={videoRef}
            key={sourceUrl}
            src={sourceUrl}
            controls
            playsInline
            preload="metadata"
            style={{ width: "100%", maxWidth: 720, borderRadius: 12, background: "#000000" }}
            onLoadStart={(event) => logTimelineEvent("loadstart", event.currentTarget)}
            onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
            onCanPlay={(event) => handleCanPlay(event.currentTarget)}
            onPlay={(event) => handlePlay(event.currentTarget)}
            onPlaying={(event) => logTimelineEvent("playing", event.currentTarget)}
            onWaiting={(event) => logTimelineEvent("waiting", event.currentTarget)}
            onStalled={(event) => logTimelineEvent("stalled", event.currentTarget)}
            onSuspend={(event) => logTimelineEvent("suspend", event.currentTarget)}
            onAbort={(event) => logTimelineEvent("abort", event.currentTarget)}
            onError={(event) => handleError(event.currentTarget)}
          >
            Your browser does not support HTML5 video.
          </video>
        ) : (
          <p style={{ margin: 0, color: "#6b7280" }}>Open this page with `?mediaId=...` to start the diagnostic test.</p>
        )}
      </section>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          background: "#ffffff",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Event log</h2>
        {eventLog.length ? (
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
            {eventLog.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.name}</strong>{" "}
                <span style={{ color: "#6b7280" }}>({entry.timestamp})</span>
                <div style={{ marginTop: 4, wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{entry.detail}</div>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ margin: 0, color: "#6b7280" }}>No media events yet. Load a `mediaId` and press play on the native video element.</p>
        )}
      </section>
    </main>
  );
}
