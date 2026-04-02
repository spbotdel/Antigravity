"use client";

import { useEffect, useRef } from "react";
import type { MediaAssetRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface DocumentPreviewDialogProps {
    asset: MediaAssetRecord | null;
    shareToken?: string | null;
    open: boolean;
    onClose: () => void;
}

function buildMediaUrl(mediaId: string, shareToken?: string | null) {
    const params = new URLSearchParams();
    if (shareToken) {
        params.set("share", shareToken);
    }

    return params.size ? `/api/media/${mediaId}?${params.toString()}` : `/api/media/${mediaId}`;
}

function isPdfAsset(asset: MediaAssetRecord) {
    const mime = (asset.mime_type || "").toLowerCase();
    return mime === "application/pdf" || mime.endsWith("/pdf");
}

function isTextAsset(asset: MediaAssetRecord) {
    const mime = (asset.mime_type || "").toLowerCase();
    return mime.startsWith("text/");
}

function canPreview(asset: MediaAssetRecord) {
    return isPdfAsset(asset) || isTextAsset(asset);
}

export function DocumentPreviewDialog({ asset, shareToken, open, onClose }: DocumentPreviewDialogProps) {
    const overlayRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                onClose();
            }
        }

        document.addEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
    }, [open, onClose]);

    if (!open || !asset) {
        return null;
    }

    const mediaUrl = buildMediaUrl(asset.id, shareToken);
    const previewable = canPreview(asset);

    return (
        <div
            ref={overlayRef}
            className="document-preview-overlay"
            onClick={(event) => {
                if (event.target === overlayRef.current) {
                    onClose();
                }
            }}
            role="dialog"
            aria-modal="true"
            aria-label={asset.title || "Документ"}
        >
            <div className="document-preview-container">
                <div className="document-preview-header">
                    <h3 className="document-preview-title">{asset.title || "Документ"}</h3>
                    <div className="document-preview-header-actions">
                        <a
                            href={mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="document-preview-download-btn"
                        >
                            Скачать
                        </a>
                        <button
                            type="button"
                            className="document-preview-close-btn"
                            onClick={onClose}
                            aria-label="Закрыть"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="document-preview-body">
                    {previewable ? (
                        <iframe
                            src={mediaUrl}
                            className="document-preview-iframe"
                            title={asset.title || "Документ"}
                        />
                    ) : (
                        <div className="document-preview-fallback">
                            <div className="document-preview-fallback-icon">📄</div>
                            <strong>Предпросмотр недоступен</strong>
                            <p>Для этого формата предпросмотр пока не поддерживается.</p>
                            <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <Button type="button" variant="secondary">
                                    Скачать файл
                                </Button>
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
