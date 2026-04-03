"use client";

import { useEffect, useState } from "react";

import type { MediaAssetRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";

const OFFICE_DOCUMENT_PREVIEW_TIMEOUT_MS = 7000;
const MICROSOFT_OFFICE_VIEWER_BASE_URL = "https://view.officeapps.live.com/op/view.aspx?src=";
const WORD_DOCUMENT_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

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
  if (WORD_DOCUMENT_MIME_TYPES.has(mimeType)) {
    return true;
  }

  const titleExtension = getFileExtension(asset.title);
  if (titleExtension === ".doc" || titleExtension === ".docx") {
    return true;
  }

  const storagePathExtension = getFileExtension(asset.storage_path);
  return storagePathExtension === ".doc" || storagePathExtension === ".docx";
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
