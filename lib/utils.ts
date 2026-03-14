import type { MediaStorageBackend, MediaUploadRolloutState, UploadMode, VariantUploadMode } from "@/lib/types";

export function formatDate(date: string | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
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
    xhr.onerror = () => reject(new Error(input.errorMessage));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }

      const payload = xhr.response && typeof xhr.response === "object" ? xhr.response : null;
      reject(
        new Error(
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
    } catch {
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
