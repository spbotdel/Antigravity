"use client";

import { useCallback, useRef, useState } from "react";
import type { MediaAssetRecord } from "@/lib/types";
import { uploadFileWithTransportContract } from "@/lib/utils";
import { DocumentPreviewDialog } from "@/components/media/document-preview-dialog";
import { buildCloudflareOfficeDocumentPublicUrl } from "@/components/media/office-document-preview";
import { Button } from "@/components/ui/button";

interface DocumentArchiveViewProps {
    treeId: string;
    slug: string;
    shareToken?: string | null;
    cloudflareR2PublicBaseUrl?: string | null;
    canEdit: boolean;
    media: MediaAssetRecord[];
    onMediaChange: (next: MediaAssetRecord[]) => void;
}

const MAX_DOCUMENT_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf";

function formatFileSize(sizeBytes: number | null | undefined) {
    if (!sizeBytes) {
        return "";
    }

    if (sizeBytes >= 1024 * 1024) {
        return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
    }

    if (sizeBytes >= 1024) {
        return `${Math.round(sizeBytes / 1024)} КБ`;
    }

    return `${sizeBytes} Б`;
}

function getDocumentTypeLabel(mimeType: string | null | undefined) {
    if (!mimeType) {
        return "Файл";
    }

    const lower = mimeType.toLowerCase();
    if (lower === "application/pdf" || lower.endsWith("/pdf")) return "PDF";
    if (lower.includes("word") || lower.includes(".document")) return "Word";
    if (lower.includes("spreadsheet") || lower.includes("excel") || lower.includes(".sheet")) return "Excel";
    if (lower.includes("presentation") || lower.includes("powerpoint") || lower.includes(".presentation")) return "PowerPoint";
    if (lower.startsWith("text/plain")) return "Text";
    if (lower.includes("csv")) return "CSV";
    if (lower.includes("rtf")) return "RTF";
    if (lower.startsWith("text/")) return "Text";
    return "Файл";
}

function getDocumentIcon(mimeType: string | null | undefined) {
    const label = getDocumentTypeLabel(mimeType);
    switch (label) {
        case "PDF":
            return "📕";
        case "Word":
            return "📘";
        case "Excel":
            return "📗";
        case "PowerPoint":
            return "📙";
        case "Text":
        case "CSV":
        case "RTF":
            return "📄";
        default:
            return "📄";
    }
}

function isPdfOrText(asset: MediaAssetRecord) {
    const mime = (asset.mime_type || "").toLowerCase();
    return mime === "application/pdf" || mime.endsWith("/pdf") || mime.startsWith("text/");
}

function buildMediaUrl(mediaId: string, shareToken?: string | null) {
    const params = new URLSearchParams();
    if (shareToken) {
        params.set("share", shareToken);
    }

    return params.size ? `/api/media/${mediaId}?${params.toString()}` : `/api/media/${mediaId}`;
}

async function requestJson(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || "Запрос не выполнен.");
    }

    return payload;
}

interface ArchiveUploadTarget {
    mediaId: string;
    path: string;
    signedUrl: string;
    variantTargets?: Array<{ variant: "thumb" | "small" | "medium"; path: string; signedUrl: string; token?: string }>;
    [key: string]: unknown;
}

export function DocumentArchiveView({ treeId, slug, shareToken, cloudflareR2PublicBaseUrl, canEdit, media, onMediaChange }: DocumentArchiveViewProps) {
    const [previewAsset, setPreviewAsset] = useState<MediaAssetRecord | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const mountedRef = useRef(true);

    const handleClosePreview = useCallback(() => {
        setPreviewAsset(null);
    }, []);

    async function uploadFiles(files: File[]) {
        if (isUploading || !files.length) {
            return;
        }

        const oversized = files.find((f) => f.size > MAX_DOCUMENT_FILE_SIZE_BYTES);
        if (oversized) {
            setError(`Файл больше ${Math.round(MAX_DOCUMENT_FILE_SIZE_BYTES / (1024 * 1024))} МБ: ${oversized.name}`);
            return;
        }

        setIsUploading(true);
        setError(null);
        setStatus(null);

        const uploaded: MediaAssetRecord[] = [];

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setUploadProgress(`Загрузка ${i + 1} из ${files.length}: ${file.name}`);

                const intent = (await requestJson("/api/media/archive/upload-intent", "POST", {
                    treeId,
                    filename: file.name,
                    mimeType: file.type,
                    visibility: "members",
                    title: file.name,
                    caption: "",
                })) as ArchiveUploadTarget;

                if (!mountedRef.current) return;

                await uploadFileWithTransportContract({
                    target: intent,
                    file,
                    onProgress: undefined,
                    directErrorMessage: "Не удалось отправить файл напрямую в хранилище.",
                    proxyErrorMessage: "Не удалось отправить файл на сервер.",
                    proxyResponseErrorMessage: "Не удалось загрузить файл.",
                    variantErrorMessage: "Не удалось подготовить варианты.",
                });

                if (!mountedRef.current) return;

                const payload = await requestJson("/api/media/archive/complete", "POST", {
                    treeId,
                    mediaId: intent.mediaId,
                    storagePath: intent.path,
                    variantPaths: intent.variantTargets?.map((t) => ({ variant: t.variant, storagePath: t.path })),
                    visibility: "members",
                    title: file.name,
                    caption: "",
                    mimeType: file.type,
                    sizeBytes: file.size,
                });

                if (!mountedRef.current) return;

                const created = payload.media as MediaAssetRecord;
                uploaded.push(created);
            }

            onMediaChange([...uploaded, ...media]);
            setStatus(uploaded.length === 1 ? "Документ загружен." : `Загружено документов: ${uploaded.length}.`);
        } catch (uploadError) {
            if (uploaded.length) {
                onMediaChange([...uploaded, ...media]);
            }

            setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить документ.");
        } finally {
            setIsUploading(false);
            setUploadProgress(null);
        }
    }

    function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files || []).filter((f) => f.size > 0);
        if (files.length) {
            void uploadFiles(files);
        }

        if (event.target instanceof HTMLInputElement) {
            event.target.value = "";
        }
    }

    async function handleDelete() {
        if (!deleteTargetId) return;

        setError(null);
        try {
            const payload = await requestJson(`/api/media/${deleteTargetId}`, "DELETE", {});
            const nextMedia = media.filter((a) => a.id !== deleteTargetId);
            onMediaChange(nextMedia);
            if (previewAsset?.id === deleteTargetId) {
                setPreviewAsset(null);
            }
            setStatus(payload.message || "Документ удалён.");
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить.");
        } finally {
            setDeleteTargetId(null);
        }
    }

    function handleDragOver(event: React.DragEvent) {
        event.preventDefault();
        setIsDragging(true);
    }

    function handleDragLeave(event: React.DragEvent) {
        event.preventDefault();
        setIsDragging(false);
    }

    function handleDrop(event: React.DragEvent) {
        event.preventDefault();
        setIsDragging(false);
        const files = Array.from(event.dataTransfer.files).filter((f) => f.size > 0);
        if (files.length) {
            void uploadFiles(files);
        }
    }

    return (
        <div className="document-archive">
            {error ? <p className="form-error">{error}</p> : null}
            {status ? <p className="form-success">{status}</p> : null}

            {isUploading && uploadProgress ? (
                <div className="document-archive-upload-status">
                    <span>{uploadProgress}</span>
                </div>
            ) : null}

            {media.length === 0 && !isUploading ? (
                <div className="document-archive-empty">
                    <div className="document-archive-empty-icon">📄</div>
                    <strong>Документов пока нет</strong>
                    <p>Загрузите PDF, Word, Excel или другие документы.</p>
                    {canEdit ? (
                        <>
                            <input
                                ref={fileInputRef}
                                className="builder-native-file-input"
                                type="file"
                                multiple
                                accept={DOCUMENT_ACCEPT}
                                onChange={handleFileSelection}
                            />
                            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                                Загрузить документ
                            </Button>
                        </>
                    ) : null}
                </div>
            ) : null}

            {media.length > 0 ? (
                <div className="document-archive-list" role="list">
                    {media.map((asset) => {
                        const typeLabel = getDocumentTypeLabel(asset.mime_type);
                        const icon = getDocumentIcon(asset.mime_type);
                        const canPreviewThis = isPdfOrText(asset) || Boolean(buildCloudflareOfficeDocumentPublicUrl(asset, cloudflareR2PublicBaseUrl));
                        return (
                            <div key={asset.id} className="document-archive-row" role="listitem">
                                <span className="document-archive-icon">{icon}</span>

                                <span className="document-archive-name">{asset.title || "Документ"}</span>

                                <span className="document-archive-type">{typeLabel}</span>

                                {asset.size_bytes ? (
                                    <span className="document-archive-size">{formatFileSize(asset.size_bytes)}</span>
                                ) : null}

                                <div className="document-archive-actions">
                                    {canPreviewThis ? (
                                        <button
                                            type="button"
                                            className="document-archive-action-btn"
                                            onClick={() => setPreviewAsset(asset)}
                                            title="Открыть"
                                        >
                                            Открыть
                                        </button>
                                    ) : null}
                                    <a
                                        href={buildMediaUrl(asset.id, shareToken)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="document-archive-action-btn"
                                        title="Скачать"
                                    >
                                        ↓
                                    </a>
                                    {canEdit ? (
                                        <button
                                            type="button"
                                            className="document-archive-action-btn document-archive-action-btn-danger"
                                            onClick={() => setDeleteTargetId(asset.id)}
                                            title="Удалить"
                                        >
                                            ✕
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            <DocumentPreviewDialog
                asset={previewAsset}
                shareToken={shareToken}
                cloudflareR2PublicBaseUrl={cloudflareR2PublicBaseUrl}
                open={previewAsset !== null}
                onClose={handleClosePreview}
            />

            {canEdit ? (
                <div
                    className={`document-archive-dropzone${isDragging ? " document-archive-dropzone-active" : ""}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <input
                        ref={fileInputRef}
                        className="builder-native-file-input"
                        type="file"
                        multiple
                        accept={DOCUMENT_ACCEPT}
                        onChange={handleFileSelection}
                    />
                    <p>Перетащите документы сюда или <button type="button" className="document-archive-dropzone-btn" onClick={() => fileInputRef.current?.click()}>выберите файлы</button></p>
                </div>
            ) : null}

            {deleteTargetId ? (
                <div className="document-archive-confirm-overlay" onClick={() => setDeleteTargetId(null)}>
                    <div className="document-archive-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <strong>Удалить документ?</strong>
                        <p>Это действие нельзя отменить.</p>
                        <div className="document-archive-confirm-actions">
                            <Button type="button" variant="secondary" onClick={() => setDeleteTargetId(null)}>Отмена</Button>
                            <Button type="button" variant="destructive" onClick={handleDelete}>Удалить</Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
