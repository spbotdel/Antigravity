"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import type { MediaAssetRecord } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import {
    buildCloudflareOfficeDocumentPublicUrl,
    isOfficePowerPointDocumentAsset,
    OfficeDocumentPreview
} from "@/components/media/office-document-preview";

interface DocumentPreviewDialogProps {
    asset: MediaAssetRecord | null;
    shareToken?: string | null;
    cloudflareR2PublicBaseUrl?: string | null;
    open: boolean;
    onClose: () => void;
}

function buildMediaUrl(mediaId: string, shareToken?: string | null, options?: { download?: boolean }) {
    const params = new URLSearchParams();
    if (options?.download) {
        params.set("download", "1");
    }
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

const FOCUSABLE_DIALOG_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableDialogElements(container: HTMLElement | null) {
    if (!container) {
        return [];
    }

    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_DIALOG_SELECTOR)).filter(
        (element) => element.tabIndex >= 0 && element.getAttribute("aria-disabled") !== "true"
    );
}

export function DocumentPreviewDialog({ asset, shareToken, cloudflareR2PublicBaseUrl, open, onClose }: DocumentPreviewDialogProps) {
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    const titleId = useId();

    const restoreDialogFocusAfterPreviewLoad = useCallback((iframe: HTMLIFrameElement) => {
        const delays = [0, 100, 500, 1000];
        for (const delay of delays) {
            window.setTimeout(() => {
                if (overlayRef.current && document.activeElement === iframe) {
                    overlayRef.current.focus();
                }
            }, delay);
        }
    }, []);

    useEffect(() => {
        if (!open) return;

        restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousBodyOverflow = document.body.style.overflow;
        const focusTimerId = window.setTimeout(() => {
            const focusTarget = getFocusableDialogElements(overlayRef.current)[0] || overlayRef.current;
            focusTarget?.focus();
        }, 0);

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                onClose();
                return;
            }

            if (event.key !== "Tab") {
                return;
            }

            const focusableElements = getFocusableDialogElements(overlayRef.current);
            if (!focusableElements.length) {
                event.preventDefault();
                overlayRef.current?.focus();
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement;

            if (event.shiftKey && (!overlayRef.current?.contains(activeElement) || activeElement === firstElement)) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        }

        document.addEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "hidden";

        return () => {
            window.clearTimeout(focusTimerId);
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            const restoreTarget = restoreFocusRef.current;
            restoreFocusRef.current = null;
            if (restoreTarget?.isConnected) {
                restoreTarget.focus();
            }
        };
    }, [open, onClose]);

    if (!open || !asset) {
        return null;
    }

    const mediaUrl = buildMediaUrl(asset.id, shareToken);
    const downloadUrl = buildMediaUrl(asset.id, shareToken, { download: true });
    const previewable = canPreview(asset);
    const officePreviewUrl = buildCloudflareOfficeDocumentPublicUrl(asset, cloudflareR2PublicBaseUrl);
    const showPowerPointWarning = isOfficePowerPointDocumentAsset(asset);

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
            aria-labelledby={titleId}
            tabIndex={-1}
        >
            <div className="document-preview-container">
                <div className="document-preview-header">
                    <div className="document-preview-header-copy">
                        <h3 id={titleId} className="document-preview-title">{asset.title || "Документ"}</h3>
                        {showPowerPointWarning ? (
                            <p className="document-preview-warning">
                                Предпросмотр PowerPoint работает нестабильно. Для надёжного просмотра рекомендуем сохранить файл в PDF.
                            </p>
                        ) : null}
                    </div>
                    <div className="document-preview-header-actions">
                        <a
                            href={downloadUrl}
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
                            tabIndex={-1}
                            onLoad={(event) => restoreDialogFocusAfterPreviewLoad(event.currentTarget)}
                        />
                    ) : officePreviewUrl ? (
                        <OfficeDocumentPreview
                            publicFileUrl={officePreviewUrl}
                            title={asset.title}
                            downloadUrl={downloadUrl}
                            onPreviewLoad={restoreDialogFocusAfterPreviewLoad}
                        />
                    ) : (
                        <div className="document-preview-fallback">
                            <div className="document-preview-fallback-icon">📄</div>
                            <strong>Предпросмотр недоступен</strong>
                            <p>Для этого формата предпросмотр пока не поддерживается.</p>
                            <a
                                href={downloadUrl}
                                className={buttonVariants({ variant: "secondary" })}
                            >
                                Скачать файл
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
