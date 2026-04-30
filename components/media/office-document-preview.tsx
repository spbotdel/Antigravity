"use client";

import { useEffect, useState } from "react";

import type { MediaAssetRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";

const OFFICE_DOCUMENT_PREVIEW_TIMEOUT_MS = 7000;
const MICROSOFT_OFFICE_VIEWER_BASE_URL = "https://view.officeapps.live.com/op/view.aspx?src=";
const OFFICE_DOCUMENT_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.ms-word.document.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
]);
const POWERPOINT_DOCUMENT_MIME_TYPES = new Set([
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
]);
const OFFICE_DOCUMENT_EXTENSIONS = new Set([".doc", ".docx", ".docm", ".xls", ".xlsx", ".xlsm", ".ppt", ".pptx", ".pptm", ".ppsx"]);
const POWERPOINT_DOCUMENT_EXTENSIONS = new Set([".ppt", ".pptx", ".pptm", ".ppsx"]);

function getFileExtension(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase().split(/[?#]/, 1)[0];
  const lastDotIndex = normalizedValue.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === normalizedValue.length - 1) {
    return null;
  }

  return normalizedValue.slice(lastDotIndex);
}

function encodeStoragePath(storagePath: string) {
  return storagePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function isOfficeWordDocumentAsset(asset: Pick<MediaAssetRecord, "mime_type" | "storage_path" | "title">) {
  const mimeType = asset.mime_type?.trim().toLowerCase() || "";
  if (
    OFFICE_DOCUMENT_MIME_TYPES.has(mimeType) ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  ) {
    return true;
  }

  const titleExtension = getFileExtension(asset.title);
  if (titleExtension && OFFICE_DOCUMENT_EXTENSIONS.has(titleExtension)) {
    return true;
  }

  const storagePathExtension = getFileExtension(asset.storage_path);
  return Boolean(storagePathExtension && OFFICE_DOCUMENT_EXTENSIONS.has(storagePathExtension));
}

export function isOfficePowerPointDocumentAsset(asset: Pick<MediaAssetRecord, "mime_type" | "storage_path" | "title">) {
  const mimeType = asset.mime_type?.trim().toLowerCase() || "";
  if (
    POWERPOINT_DOCUMENT_MIME_TYPES.has(mimeType) ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  ) {
    return true;
  }

  const titleExtension = getFileExtension(asset.title);
  if (titleExtension && POWERPOINT_DOCUMENT_EXTENSIONS.has(titleExtension)) {
    return true;
  }

  const storagePathExtension = getFileExtension(asset.storage_path);
  return Boolean(storagePathExtension && POWERPOINT_DOCUMENT_EXTENSIONS.has(storagePathExtension));
}

export function buildCloudflareOfficeDocumentPublicUrl(
  asset: Pick<MediaAssetRecord, "provider" | "storage_path" | "mime_type" | "title">,
  cloudflareR2PublicBaseUrl?: string | null,
) {
  if (asset.provider !== "cloudflare_r2" || !asset.storage_path || !isOfficeWordDocumentAsset(asset)) {
    return null;
  }

  const normalizedBaseUrl = cloudflareR2PublicBaseUrl?.trim().replace(/\/+$/, "") || "";
  if (!normalizedBaseUrl) {
    return null;
  }

  try {
    return new URL(encodeStoragePath(asset.storage_path), `${normalizedBaseUrl}/`).toString();
  } catch {
    return null;
  }
}

export function buildMicrosoftOfficeViewerUrl(fileUrl: string) {
  return `${MICROSOFT_OFFICE_VIEWER_BASE_URL}${encodeURIComponent(fileUrl)}`;
}

interface OfficeDocumentPreviewProps {
  publicFileUrl: string;
  title?: string | null;
  downloadUrl: string;
}

export function OfficeDocumentPreview({ publicFileUrl, title, downloadUrl }: OfficeDocumentPreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    setHasTimedOut(false);

    const timeoutId = window.setTimeout(() => {
      setHasTimedOut(true);
    }, OFFICE_DOCUMENT_PREVIEW_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [publicFileUrl]);

  if (hasTimedOut && !isLoaded) {
    return (
      <div className="document-preview-fallback">
        <div className="document-preview-fallback-icon">📄</div>
        <strong>Предпросмотр не загрузился</strong>
        <p>Microsoft viewer не ответил вовремя. Попробуйте скачать документ и открыть его локально.</p>
        <a href={downloadUrl} target="_blank" rel="noreferrer">
          <Button type="button" variant="secondary">
            Скачать файл
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="document-preview-office-shell">
      {!isLoaded ? (
        <div className="document-preview-loading" aria-live="polite">
          <span className="document-preview-loading-spinner" aria-hidden="true" />
          <span>Открываем документ через Microsoft viewer...</span>
        </div>
      ) : null}
      <iframe
        src={buildMicrosoftOfficeViewerUrl(publicFileUrl)}
        className="document-preview-iframe"
        title={title || "Документ Microsoft Office"}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  );
}
