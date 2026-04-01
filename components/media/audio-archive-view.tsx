"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaAssetRecord } from "@/lib/types";
import { uploadFileWithTransportContract } from "@/lib/utils";
import { AudioPlayer } from "@/components/media/audio-player";
import { Button } from "@/components/ui/button";

interface AudioArchiveViewProps {
    treeId: string;
    slug: string;
    shareToken?: string | null;
    canEdit: boolean;
    media: MediaAssetRecord[];
    onMediaChange: (next: MediaAssetRecord[]) => void;
}

const MAX_AUDIO_FILE_SIZE_BYTES = 100 * 1024 * 1024;

function formatDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "";
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

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

function getAudioFormatLabel(mimeType: string | null | undefined) {
    if (!mimeType) {
        return "";
    }

    const lower = mimeType.toLowerCase();
    if (lower.includes("mpeg") || lower.includes("mp3")) return "MP3";
    if (lower.includes("wav")) return "WAV";
    if (lower.includes("ogg")) return "OGG";
    if (lower.includes("flac")) return "FLAC";
    if (lower.includes("aac")) return "AAC";
    if (lower.includes("webm")) return "WebM";
    if (lower.includes("opus")) return "Opus";
    return "";
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

export function AudioArchiveView({ treeId, slug, shareToken, canEdit, media, onMediaChange }: AudioArchiveViewProps) {
    const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!activeTrackId) {
            return;
        }

        if (media.some((asset) => asset.id === activeTrackId)) {
            return;
        }

        setActiveTrackId(media[0]?.id || null);
        setIsPlaying(false);
    }, [activeTrackId, media]);

    const handleTrackSelect = useCallback((trackId: string) => {
        setActiveTrackId(trackId);
        setIsPlaying(true);
    }, []);

    const handleTrackToggle = useCallback((trackId: string) => {
        if (activeTrackId === trackId) {
            setIsPlaying((current) => !current);
            return;
        }

        handleTrackSelect(trackId);
    }, [activeTrackId, handleTrackSelect]);

    const handlePlayingChange = useCallback((nextIsPlaying: boolean) => {
        setIsPlaying(nextIsPlaying);
    }, []);

    async function uploadFiles(files: File[]) {
        if (isUploading || !files.length) {
            return;
        }

        const oversized = files.find((f) => f.size > MAX_AUDIO_FILE_SIZE_BYTES);
        if (oversized) {
            setError(`Файл больше ${Math.round(MAX_AUDIO_FILE_SIZE_BYTES / (1024 * 1024))} МБ: ${oversized.name}`);
            return;
        }

        const audioFiles = files.filter((f) => f.type.startsWith("audio/"));
        if (!audioFiles.length) {
            setError("Выберите аудиофайлы.");
            return;
        }

        setIsUploading(true);
        setError(null);
        setStatus(null);

        const uploaded: MediaAssetRecord[] = [];

        try {
            for (let i = 0; i < audioFiles.length; i++) {
                const file = audioFiles[i];
                setUploadProgress(`Загрузка ${i + 1} из ${audioFiles.length}: ${file.name}`);

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
            setStatus(uploaded.length === 1 ? "Аудио загружено." : `Загружено аудио: ${uploaded.length}.`);
        } catch (uploadError) {
            if (uploaded.length) {
                onMediaChange([...uploaded, ...media]);
            }

            setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить аудио.");
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
            if (activeTrackId === deleteTargetId) {
                setIsPlaying(false);
            }
            setStatus(payload.message || "Аудио удалено.");
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
        const files = Array.from(event.dataTransfer.files).filter((f) => f.size > 0 && f.type.startsWith("audio/"));
        if (files.length) {
            void uploadFiles(files);
        }
    }

    return (
        <div className={`audio-archive${activeTrackId ? " audio-archive-has-player" : ""}`}>
            {error ? <p className="form-error">{error}</p> : null}
            {status ? <p className="form-success">{status}</p> : null}

            {isUploading && uploadProgress ? (
                <div className="audio-archive-upload-status">
                    <span>{uploadProgress}</span>
                </div>
            ) : null}

            {media.length === 0 && !isUploading ? (
                <div className="audio-archive-empty">
                    <div className="audio-archive-empty-icon">🎵</div>
                    <strong>Аудиозаписей пока нет</strong>
                    <p>Загрузите аудиофайлы — голосовые записи, интервью, музыку.</p>
                    {canEdit ? (
                        <>
                            <input
                                ref={fileInputRef}
                                className="builder-native-file-input"
                                type="file"
                                multiple
                                accept="audio/*"
                                onChange={handleFileSelection}
                            />
                            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                                Загрузить аудио
                            </Button>
                        </>
                    ) : null}
                </div>
            ) : null}

            {media.length > 0 ? (
                <div className="audio-archive-list" role="list">
                    {media.map((asset, index) => {
                        const isActive = activeTrackId === asset.id;
                        const isTrackPlaying = isActive && isPlaying;
                        const format = getAudioFormatLabel(asset.mime_type);
                        return (
                            <div
                                key={asset.id}
                                className={`audio-archive-row${isActive ? " audio-archive-row-active" : ""}`}
                                role="listitem"
                            >
                                <button
                                    type="button"
                                    className="audio-archive-play-btn"
                                    onClick={() => handleTrackToggle(asset.id)}
                                    aria-label={isTrackPlaying ? "Пауза" : "Воспроизвести"}
                                >
                                    {isTrackPlaying ? "⏸" : "▶"}
                                </button>

                                <span className="audio-archive-index">{index + 1}</span>

                                <span className="audio-archive-title">{asset.title || "Без названия"}</span>

                                {format ? <span className="audio-archive-format">{format}</span> : null}

                                {asset.size_bytes ? (
                                    <span className="audio-archive-size">{formatFileSize(asset.size_bytes)}</span>
                                ) : null}

                                <div className="audio-archive-actions">
                                    <a
                                        href={buildMediaUrl(asset.id, shareToken)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="audio-archive-action-btn"
                                        aria-label="Скачать"
                                        title="Скачать"
                                    >
                                        ↓
                                    </a>
                                    {canEdit ? (
                                        <button
                                            type="button"
                                            className="audio-archive-action-btn audio-archive-action-btn-danger"
                                            onClick={() => setDeleteTargetId(asset.id)}
                                            aria-label="Удалить"
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

            <AudioPlayer
                tracks={media}
                activeTrackId={activeTrackId}
                isPlaying={isPlaying}
                shareToken={shareToken}
                onTrackChange={handleTrackSelect}
                onPlayingChange={handlePlayingChange}
            />

            {canEdit ? (
                <div
                    className={`audio-archive-dropzone${isDragging ? " audio-archive-dropzone-active" : ""}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <input
                        ref={fileInputRef}
                        className="builder-native-file-input"
                        type="file"
                        multiple
                        accept="audio/*"
                        onChange={handleFileSelection}
                    />
                    <p>Перетащите аудиофайлы сюда или <button type="button" className="audio-archive-dropzone-btn" onClick={() => fileInputRef.current?.click()}>выберите файлы</button></p>
                </div>
            ) : null}

            {deleteTargetId ? (
                <div className="audio-archive-confirm-overlay" onClick={() => setDeleteTargetId(null)}>
                    <div className="audio-archive-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <strong>Удалить аудиозапись?</strong>
                        <p>Это действие нельзя отменить.</p>
                        <div className="audio-archive-confirm-actions">
                            <Button type="button" variant="secondary" onClick={() => setDeleteTargetId(null)}>Отмена</Button>
                            <Button type="button" variant="destructive" onClick={handleDelete}>Удалить</Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
