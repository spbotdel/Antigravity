import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { MediaStorageBackend, MediaUploadRolloutState, UploadMode, VariantUploadMode } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type MediaErrorLogType = "thumb" | "original";

const loggedMediaErrors = new Set<string>();
const reportedMediaClientPlaybackIssues = new Set<string>();
const reportedMediaClientPlaybackEvents = new Set<string>();

function shouldLogMediaErrors() {
  return process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEBUG_MEDIA_ERRORS === "1";
}

export function logMediaError(input: {
  mediaId: string;
  type: MediaErrorLogType;
  context: string;
  src?: string | null;
}) {
  if (typeof window === "undefined" || !shouldLogMediaErrors()) {
    return;
  }

  const dedupeKey = `${input.mediaId}:${input.type}`;
  if (loggedMediaErrors.has(dedupeKey)) {
    return;
  }

  loggedMediaErrors.add(dedupeKey);
  console.warn("[media-client]", input);
}

export function __resetLoggedMediaErrorsForTests() {
  loggedMediaErrors.clear();
  reportedMediaClientPlaybackIssues.clear();
  reportedMediaClientPlaybackEvents.clear();
}

export interface MediaClientPlaybackDiagnosticInput {
  mediaId: string;
  context: string;
  shareToken?: string | null;
  pageUrl?: string | null;
  src?: string | null;
  currentSrc?: string | null;
  poster?: string | null;
  errorCode?: number | null;
  networkState?: number | null;
  readyState?: number | null;
  currentTime?: number | null;
  duration?: number | null;
  controls?: boolean | null;
  playsInline?: boolean | null;
  autoPlay?: boolean | null;
  muted?: boolean | null;
  preload?: string | null;
}

export interface MediaClientPlaybackEventDiagnosticInput extends MediaClientPlaybackDiagnosticInput {
  eventName: "loadstart" | "loadedmetadata" | "canplay" | "play" | "playing" | "waiting" | "stalled" | "suspend" | "abort" | "error";
}

export function reportMediaClientPlaybackIssue(input: MediaClientPlaybackDiagnosticInput) {
  if (typeof window === "undefined") {
    return;
  }

  const dedupeKey = `${input.mediaId}:${input.context}:${input.errorCode ?? "na"}:${input.currentSrc || input.src || "none"}`;
  if (reportedMediaClientPlaybackIssues.has(dedupeKey)) {
    return;
  }

  reportedMediaClientPlaybackIssues.add(dedupeKey);

  const payload = {
    event: "client-original-error" as const,
    context: input.context,
    shareToken: input.shareToken || null,
    pageUrl: input.pageUrl || window.location.href,
    src: input.src || null,
    currentSrc: input.currentSrc || null,
    poster: input.poster || null,
    errorCode: input.errorCode ?? null,
    networkState: input.networkState ?? null,
    readyState: input.readyState ?? null,
    currentTime: input.currentTime ?? null,
    duration: input.duration ?? null,
    controls: input.controls ?? null,
    playsInline: input.playsInline ?? null,
    autoPlay: input.autoPlay ?? null,
    muted: input.muted ?? null,
    preload: input.preload ?? null,
  };

  const endpoint = `/api/media/${input.mediaId}`;
  const body = JSON.stringify(payload);

  void fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function reportMediaClientPlaybackEvent(input: MediaClientPlaybackEventDiagnosticInput) {
  if (typeof window === "undefined") {
    return;
  }

  const dedupeKey = `${input.mediaId}:${input.context}:${input.eventName}:${input.currentSrc || input.src || "none"}:${input.readyState ?? "na"}:${input.networkState ?? "na"}`;
  if (reportedMediaClientPlaybackEvents.has(dedupeKey)) {
    return;
  }

  reportedMediaClientPlaybackEvents.add(dedupeKey);

  const payload = {
    event: "client-video-event" as const,
    eventName: input.eventName,
    context: input.context,
    shareToken: input.shareToken || null,
    pageUrl: input.pageUrl || window.location.href,
    src: input.src || null,
    currentSrc: input.currentSrc || null,
    poster: input.poster || null,
    errorCode: input.errorCode ?? null,
    networkState: input.networkState ?? null,
    readyState: input.readyState ?? null,
    currentTime: input.currentTime ?? null,
    duration: input.duration ?? null,
    controls: input.controls ?? null,
    playsInline: input.playsInline ?? null,
    autoPlay: input.autoPlay ?? null,
    muted: input.muted ?? null,
    preload: input.preload ?? null,
  };

  const endpoint = `/api/media/${input.mediaId}`;

  void fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}

export function formatDate(date: string | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

export interface BrowserMediaVariantTarget {
  variant: "thumb" | "small" | "medium";
  path: string;
  signedUrl: string;
}

export interface BrowserMediaUploadTarget {
  signedUrl: string;
  configuredBackend?: MediaStorageBackend;
  resolvedUploadBackend?: MediaStorageBackend;
  rolloutState?: MediaUploadRolloutState;
  forceProxyUpload?: boolean;
  uploadMode?: UploadMode;
  variantUploadMode?: VariantUploadMode;
  variantTargets?: BrowserMediaVariantTarget[];
}

export function formatMediaUploadTransportHint(target: BrowserMediaUploadTarget): string | null {
  if (target.configuredBackend !== "cloudflare_r2") {
    return null;
  }

  if (target.rolloutState === "cloudflare_rollout_gated") {
    return "Cloudflare R2 уже настроен, но rollout еще не активен: новые файлы пока идут через текущий object storage path.";
  }

  if (target.rolloutState !== "cloudflare_rollout_active") {
    return null;
  }

  if (target.uploadMode === "direct" && target.variantUploadMode === "server_proxy" && target.variantTargets?.length) {
    return "Cloudflare R2 активен: оригинал уходит напрямую в R2, а preview-варианты догружаются через сервер.";
  }

  if (target.uploadMode === "direct") {
    return "Cloudflare R2 активен: файл уходит напрямую в R2.";
  }

  if (target.forceProxyUpload) {
    return "Cloudflare R2 активен, но этот запуск принудительно использует серверный proxy upload.";
  }

  return "Cloudflare R2 активен, но этот запуск использует серверный proxy upload.";
}

export interface BasicUploadProgressSnapshot {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
}

class BrowserUploadTransportError extends Error {
  kind: "network" | "timeout" | "abort" | "response";

  constructor(kind: "network" | "timeout" | "abort" | "response", message: string) {
    super(message);
    this.name = "BrowserUploadTransportError";
    this.kind = kind;
  }
}

function shouldFallbackToProxyUpload(error: unknown) {
  return (
    error instanceof BrowserUploadTransportError &&
    (error.kind === "network" || error.kind === "timeout")
  );
}

async function uploadFileWithXhr(input: {
  url: string;
  method: "PUT" | "POST";
  body: Document | XMLHttpRequestBodyInit | null;
  contentType?: string;
  onProgress?: (progress: BasicUploadProgressSnapshot) => void;
  errorMessage: string;
  responseErrorMessage: string;
}) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(input.method, input.url);
    xhr.responseType = "json";
    if (input.contentType) {
      xhr.setRequestHeader("Content-Type", input.contentType);
    }
    xhr.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : event.loaded;
      const uploadedBytes = event.loaded;
      const percent = totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0;
      input.onProgress?.({ uploadedBytes, totalBytes, percent });
    };
    xhr.onerror = () => reject(new BrowserUploadTransportError("network", input.errorMessage));
    xhr.onabort = () => reject(new BrowserUploadTransportError("abort", "Загрузка файла была отменена."));
    xhr.ontimeout = () => reject(new BrowserUploadTransportError("timeout", input.errorMessage));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }

      const payload = xhr.response && typeof xhr.response === "object" ? xhr.response : null;
      reject(
        new BrowserUploadTransportError(
          "response",
          (payload && "error" in payload && typeof payload.error === "string" && payload.error) ||
            xhr.responseText ||
            input.responseErrorMessage
        )
      );
    };
    xhr.send(input.body);
  });
}

async function proxyMediaUpload(input: {
  file: File;
  signedUrl?: string;
  contentType?: string;
  variantTargets?: BrowserMediaVariantTarget[];
  skipPrimaryUpload?: boolean;
  onProgress?: (progress: BasicUploadProgressSnapshot) => void;
  errorMessage: string;
  responseErrorMessage: string;
}) {
  const formData = new FormData();
  if (input.signedUrl) {
    formData.set("signedUrl", input.signedUrl);
  }
  if (input.skipPrimaryUpload) {
    formData.set("skipPrimaryUpload", "true");
  }
  formData.set("contentType", input.contentType || input.file.type);
  formData.set("file", input.file);
  if (input.variantTargets?.length) {
    formData.set("variantTargets", JSON.stringify(input.variantTargets));
  }

  await uploadFileWithXhr({
    url: "/api/media/upload-file",
    method: "POST",
    body: formData,
    onProgress: input.onProgress,
    errorMessage: input.errorMessage,
    responseErrorMessage: input.responseErrorMessage,
  });
}

export async function uploadFileWithTransportContract(input: {
  target: BrowserMediaUploadTarget;
  file: File;
  onProgress?: (progress: BasicUploadProgressSnapshot) => void;
  directErrorMessage?: string;
  proxyErrorMessage?: string;
  proxyResponseErrorMessage?: string;
  variantErrorMessage?: string;
}) {
  const directErrorMessage = input.directErrorMessage || "Не удалось отправить файл напрямую в хранилище.";
  const proxyErrorMessage = input.proxyErrorMessage || "Не удалось отправить файл на сервер.";
  const proxyResponseErrorMessage = input.proxyResponseErrorMessage || "Не удалось загрузить файл.";
  const variantErrorMessage = input.variantErrorMessage || "Не удалось подготовить preview-варианты.";

  if (input.target.uploadMode === "direct") {
    try {
      await uploadFileWithXhr({
        url: input.target.signedUrl,
        method: "PUT",
        body: input.file,
        contentType: input.file.type || undefined,
        onProgress: input.onProgress,
        errorMessage: directErrorMessage,
        responseErrorMessage: directErrorMessage,
      });
    } catch (error) {
      if (!shouldFallbackToProxyUpload(error)) {
        throw error;
      }

      await proxyMediaUpload({
        file: input.file,
        signedUrl: input.target.signedUrl,
        contentType: input.file.type,
        variantTargets: input.target.variantTargets,
        onProgress: input.onProgress,
        errorMessage: proxyErrorMessage,
        responseErrorMessage: proxyResponseErrorMessage,
      });
      return;
    }

    if (input.target.variantUploadMode === "server_proxy" && input.target.variantTargets?.length) {
      await proxyMediaUpload({
        file: input.file,
        contentType: input.file.type,
        variantTargets: input.target.variantTargets,
        skipPrimaryUpload: true,
        errorMessage: proxyErrorMessage,
        responseErrorMessage: variantErrorMessage,
      });
    }

    return;
  }

  await proxyMediaUpload({
    file: input.file,
    signedUrl: input.target.signedUrl,
    contentType: input.file.type,
    variantTargets: input.target.variantTargets,
    onProgress: input.onProgress,
    errorMessage: proxyErrorMessage,
    responseErrorMessage: proxyResponseErrorMessage,
  });
}
