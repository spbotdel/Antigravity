"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FilePlus, Pause, Play } from "lucide-react";

import { AudioPlayer } from "@/components/media/audio-player";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
    AudioPlaybackSource,
    MediaAssetRecord,
    TreeAudioPlaylistItemRecord,
    TreeAudioPlaylistRecord,
} from "@/lib/types";
import { uploadFileWithTransportContract } from "@/lib/utils";

interface AudioArchiveViewProps {
    treeId: string;
    slug: string;
    shareToken?: string | null;
    canEdit: boolean;
    media: MediaAssetRecord[];
    playlists?: TreeAudioPlaylistRecord[];
    playlistItems?: TreeAudioPlaylistItemRecord[];
    playlistsAvailable?: boolean;
    onMediaChange: (next: MediaAssetRecord[]) => void;
}

interface ArchiveUploadTarget {
    mediaId: string;
    path: string;
    signedUrl: string;
    variantTargets?: Array<{ variant: "thumb" | "small" | "medium"; path: string; signedUrl: string; token?: string }>;
    [key: string]: unknown;
}

interface PlaylistTrackRow {
    playlistItemId: string;
    playlistId: string;
    position: number;
    media: MediaAssetRecord;
}

type AudioSectionView = "all" | "playlists";

const MAX_AUDIO_FILE_SIZE_BYTES = 100 * 1024 * 1024;

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

function formatTrackCount(count: number) {
    const absolute = Math.abs(count) % 100;
    const lastDigit = absolute % 10;

    if (absolute >= 11 && absolute <= 14) {
        return `${count} треков`;
    }

    if (lastDigit === 1) {
        return `${count} трек`;
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
        return `${count} трека`;
    }

    return `${count} треков`;
}

function isSamePlaybackSource(left: AudioPlaybackSource, right: AudioPlaybackSource) {
    if (left.type !== right.type) {
        return false;
    }

    if (left.type === "playlist" && right.type === "playlist") {
        return left.playlistId === right.playlistId;
    }

    return true;
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

export function AudioArchiveView({
    treeId,
    slug,
    shareToken,
    canEdit,
    media,
    playlists = [],
    playlistItems = [],
    playlistsAvailable = true,
    onMediaChange,
}: AudioArchiveViewProps) {
    const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sectionView, setSectionView] = useState<AudioSectionView>("all");
    const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
    const [playbackSource, setPlaybackSource] = useState<AudioPlaybackSource>({ type: "archive" });
    const [playlistsState, setPlaylistsState] = useState<TreeAudioPlaylistRecord[]>(playlists);
    const [playlistItemsState, setPlaylistItemsState] = useState<TreeAudioPlaylistItemRecord[]>(playlistItems);
    const [playlistName, setPlaylistName] = useState("");
    const [addToPlaylistMediaId, setAddToPlaylistMediaId] = useState<string | null>(null);
    const [newPlaylistDraftName, setNewPlaylistDraftName] = useState("");
    const [isCreatingPlaylistInline, setIsCreatingPlaylistInline] = useState(false);
    const [deletePlaylistId, setDeletePlaylistId] = useState<string | null>(null);
    const [removingPlaylistItemId, setRemovingPlaylistItemId] = useState<string | null>(null);
    const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
    const [isAddingToPlaylist, setIsAddingToPlaylist] = useState(false);
    const [isDeletingPlaylist, setIsDeletingPlaylist] = useState(false);
    const [isRemovingPlaylistItem, setIsRemovingPlaylistItem] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const newPlaylistInputRef = useRef<HTMLInputElement | null>(null);
    const mountedRef = useRef(true);
    const audioFileInputId = useId();

    const mediaById = useMemo(() => new Map(media.map((asset) => [asset.id, asset] as const)), [media]);
    const playlistTrackRowsByPlaylistId = useMemo(() => {
        const rowsByPlaylistId = new Map<string, PlaylistTrackRow[]>();
        const orderedItems = [...playlistItemsState].sort(
            (left, right) =>
                left.playlist_id.localeCompare(right.playlist_id) ||
                left.position - right.position ||
                left.created_at.localeCompare(right.created_at) ||
                left.id.localeCompare(right.id)
        );

        for (const item of orderedItems) {
            const asset = mediaById.get(item.media_id);
            if (!asset || asset.kind !== "audio") {
                continue;
            }

            const current = rowsByPlaylistId.get(item.playlist_id) || [];
            current.push({
                playlistItemId: item.id,
                playlistId: item.playlist_id,
                position: item.position,
                media: asset,
            });
            rowsByPlaylistId.set(item.playlist_id, current);
        }

        return rowsByPlaylistId;
    }, [mediaById, playlistItemsState]);
    const selectedPlaylist = useMemo(
        () => playlistsState.find((playlist) => playlist.id === selectedPlaylistId) || null,
        [playlistsState, selectedPlaylistId]
    );
    const selectedPlaylistTracks = useMemo(
        () => (selectedPlaylistId ? playlistTrackRowsByPlaylistId.get(selectedPlaylistId) || [] : []),
        [playlistTrackRowsByPlaylistId, selectedPlaylistId]
    );
    const playbackTracks = useMemo(() => {
        if (playbackSource.type === "playlist") {
            return (playlistTrackRowsByPlaylistId.get(playbackSource.playlistId) || []).map((row) => row.media);
        }

        return media;
    }, [media, playbackSource, playlistTrackRowsByPlaylistId]);
    const playbackSourceOptions = useMemo(
        () => [
            { label: "Все аудио", source: { type: "archive" as const } },
            ...playlistsState.map((playlist) => ({
                label: playlist.name,
                source: { type: "playlist" as const, playlistId: playlist.id },
            })),
        ],
        [playlistsState]
    );
    const playbackSourceLabel = useMemo(() => {
        if (playbackSource.type === "playlist") {
            return playlistsState.find((playlist) => playlist.id === playbackSource.playlistId)?.name || "Плейлист";
        }

        return "Все аудио";
    }, [playbackSource, playlistsState]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!playlistsAvailable && sectionView === "playlists") {
            setSectionView("all");
            setSelectedPlaylistId(null);
            setPlaybackSource({ type: "archive" });
        }
    }, [playlistsAvailable, sectionView]);

    useEffect(() => {
        if (selectedPlaylistId && !playlistsState.some((playlist) => playlist.id === selectedPlaylistId)) {
            setSelectedPlaylistId(null);
        }
    }, [playlistsState, selectedPlaylistId]);

    useEffect(() => {
        if (playbackSource.type === "playlist" && !playlistsState.some((playlist) => playlist.id === playbackSource.playlistId)) {
            setPlaybackSource({ type: "archive" });
        }
    }, [playbackSource, playlistsState]);

    useEffect(() => {
        if (activeTrackId && !playbackTracks.some((asset) => asset.id === activeTrackId)) {
            setActiveTrackId(playbackTracks[0]?.id || null);
            setIsPlaying(false);
        }
    }, [activeTrackId, playbackTracks]);

    useEffect(() => {
        if (!status || typeof window === "undefined") {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setStatus((currentStatus) => (currentStatus === status ? null : currentStatus));
        }, 2600);

        return () => window.clearTimeout(timeoutId);
    }, [status]);

    useEffect(() => {
        if (!isCreatingPlaylistInline) {
            return;
        }

        newPlaylistInputRef.current?.focus();
        newPlaylistInputRef.current?.select();
    }, [isCreatingPlaylistInline]);

    const handleTrackSelect = useCallback((trackId: string, source: AudioPlaybackSource) => {
        setPlaybackSource(source);
        setActiveTrackId(trackId);
        setIsPlaying(true);
    }, []);

    const handleTrackToggle = useCallback((trackId: string, source: AudioPlaybackSource) => {
        if (activeTrackId === trackId && isSamePlaybackSource(playbackSource, source)) {
            setIsPlaying((current) => !current);
            return;
        }

        handleTrackSelect(trackId, source);
    }, [activeTrackId, handleTrackSelect, playbackSource]);

    const handleTrackChange = useCallback((trackId: string) => {
        setActiveTrackId(trackId);
        setIsPlaying(true);
    }, []);

    const handlePlayingChange = useCallback((nextIsPlaying: boolean) => {
        setIsPlaying(nextIsPlaying);
    }, []);

    const handlePlaybackSourceSelect = useCallback((nextSource: AudioPlaybackSource) => {
        if (isSamePlaybackSource(playbackSource, nextSource)) {
            return;
        }

        const nextTracks =
            nextSource.type === "playlist"
                ? (playlistTrackRowsByPlaylistId.get(nextSource.playlistId) || []).map((row) => row.media)
                : media;

        setPlaybackSource(nextSource);

        if (nextSource.type === "playlist") {
            setSectionView("playlists");
            setSelectedPlaylistId(nextSource.playlistId);
        } else {
            setSectionView("all");
            setSelectedPlaylistId(null);
        }

        if (!activeTrackId || !nextTracks.some((asset) => asset.id === activeTrackId)) {
            setActiveTrackId(nextTracks[0]?.id || null);
            setIsPlaying(Boolean(nextTracks[0]) && isPlaying);
        }
    }, [activeTrackId, isPlaying, media, playbackSource, playlistTrackRowsByPlaylistId]);

    const openPlaylistDetail = useCallback((playlistId: string) => {
        setSectionView("playlists");
        setSelectedPlaylistId(playlistId);
        setPlaybackSource({ type: "playlist", playlistId });
    }, []);

    const openPlaylistsOverview = useCallback(() => {
        if (!playlistsAvailable) {
            return;
        }

        setSectionView("playlists");
        setSelectedPlaylistId(null);
    }, [playlistsAvailable]);

    const closePlaylistDetail = useCallback(() => {
        setSelectedPlaylistId(null);
        setPlaybackSource({ type: "archive" });
    }, []);

    const handleSectionViewChange = useCallback((value: string) => {
        const nextView = value === "playlists" ? "playlists" : "all";
        setSectionView(nextView);

        if (nextView === "all") {
            setSelectedPlaylistId(null);
            setPlaybackSource({ type: "archive" });
        }
    }, []);

    async function uploadFiles(files: File[]) {
        if (isUploading || !files.length) {
            return;
        }

        const oversized = files.find((file) => file.size > MAX_AUDIO_FILE_SIZE_BYTES);
        if (oversized) {
            setError(`Файл больше ${Math.round(MAX_AUDIO_FILE_SIZE_BYTES / (1024 * 1024))} МБ: ${oversized.name}`);
            return;
        }

        const audioFiles = files.filter((file) => file.type.startsWith("audio/"));
        if (!audioFiles.length) {
            setError("Выберите аудиофайлы.");
            return;
        }

        setIsUploading(true);
        setError(null);
        setStatus(null);

        const uploaded: MediaAssetRecord[] = [];

        try {
            for (let index = 0; index < audioFiles.length; index += 1) {
                const file = audioFiles[index];
                setUploadProgress(`Загрузка ${index + 1} из ${audioFiles.length}: ${file.name}`);

                const intent = (await requestJson("/api/media/archive/upload-intent", "POST", {
                    treeId,
                    filename: file.name,
                    mimeType: file.type,
                    visibility: "members",
                    title: file.name,
                    caption: "",
                })) as ArchiveUploadTarget;

                if (!mountedRef.current) {
                    return;
                }

                await uploadFileWithTransportContract({
                    target: intent,
                    file,
                    onProgress: undefined,
                    directErrorMessage: "Не удалось отправить файл напрямую в хранилище.",
                    proxyErrorMessage: "Не удалось отправить файл на сервер.",
                    proxyResponseErrorMessage: "Не удалось загрузить файл.",
                    variantErrorMessage: "Не удалось подготовить варианты.",
                });

                if (!mountedRef.current) {
                    return;
                }

                const payload = await requestJson("/api/media/archive/complete", "POST", {
                    treeId,
                    mediaId: intent.mediaId,
                    storagePath: intent.path,
                    variantPaths: intent.variantTargets?.map((target) => ({ variant: target.variant, storagePath: target.path })),
                    visibility: "members",
                    title: file.name,
                    caption: "",
                    mimeType: file.type,
                    sizeBytes: file.size,
                });

                if (!mountedRef.current) {
                    return;
                }

                uploaded.push(payload.media as MediaAssetRecord);
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
        const files = Array.from(event.target.files || []).filter((file) => file.size > 0);
        if (files.length) {
            void uploadFiles(files);
        }

        if (event.target instanceof HTMLInputElement) {
            event.target.value = "";
        }
    }

    async function handleDeleteAudio() {
        if (!deleteTargetId) {
            return;
        }

        setError(null);

        try {
            const payload = await requestJson(`/api/media/${deleteTargetId}`, "DELETE", {});
            onMediaChange(media.filter((asset) => asset.id !== deleteTargetId));
            setPlaylistItemsState((current) => current.filter((item) => item.media_id !== deleteTargetId));
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

    async function createPlaylistByName(name: string, options?: { openPlaylistView?: boolean }) {
        const trimmedName = name.trim();
        if (!trimmedName) {
            throw new Error("Введите название плейлиста.");
        }

        const payload = await requestJson("/api/media/playlists", "POST", {
            treeId,
            name: trimmedName,
        });
        const playlist = payload.playlist as TreeAudioPlaylistRecord;
        setPlaylistsState((current) => [playlist, ...current]);

        if (options?.openPlaylistView) {
            setSelectedPlaylistId(playlist.id);
            setSectionView("playlists");
            setPlaybackSource({ type: "playlist", playlistId: playlist.id });
        }

        return {
            playlist,
            message: payload.message || "Плейлист создан.",
        };
    }

    async function handleCreatePlaylist() {
        if (!playlistsAvailable) {
            setError("Плейлисты пока недоступны: миграция базы данных еще не применена.");
            return;
        }

        if (!playlistName.trim() || isCreatingPlaylist) {
            return;
        }

        setIsCreatingPlaylist(true);
        setError(null);
        setStatus(null);

        try {
            const result = await createPlaylistByName(playlistName, { openPlaylistView: true });
            setPlaylistName("");
            setStatus(result.message);
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : "Не удалось создать плейлист.");
        } finally {
            setIsCreatingPlaylist(false);
        }
    }

    async function handleDeletePlaylist() {
        if (!playlistsAvailable) {
            setError("Плейлисты пока недоступны: миграция базы данных еще не применена.");
            return;
        }

        if (!deletePlaylistId || isDeletingPlaylist) {
            return;
        }

        setIsDeletingPlaylist(true);
        setError(null);

        try {
            const payload = await requestJson(`/api/media/playlists/${deletePlaylistId}`, "DELETE");
            setPlaylistsState((current) => current.filter((playlist) => playlist.id !== deletePlaylistId));
            setPlaylistItemsState((current) => current.filter((item) => item.playlist_id !== deletePlaylistId));
            if (selectedPlaylistId === deletePlaylistId) {
                setSelectedPlaylistId(null);
                setPlaybackSource({ type: "archive" });
            }
            setStatus(payload.message || "Плейлист удален.");
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить плейлист.");
        } finally {
            setIsDeletingPlaylist(false);
            setDeletePlaylistId(null);
        }
    }

    function closeAddToPlaylistPopover() {
        setAddToPlaylistMediaId(null);
        setNewPlaylistDraftName("");
        setIsCreatingPlaylistInline(false);
    }

    function handleInlinePlaylistInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Enter") {
            event.preventDefault();
            if (!newPlaylistDraftName.trim() || isAddingToPlaylist) {
                return;
            }

            void handleCreatePlaylistAndAdd();
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();

            if (playlistsState.length) {
                setIsCreatingPlaylistInline(false);
                setNewPlaylistDraftName("");
            } else {
                closeAddToPlaylistPopover();
            }
        }
    }

    async function addCurrentTrackToPlaylist(playlistId: string, mediaId: string) {
        const payload = await requestJson("/api/media/playlists/items", "POST", {
            treeId,
            playlistId,
            mediaId,
        });

        setPlaylistItemsState((current) => [...current, payload.item as TreeAudioPlaylistItemRecord]);
    }

    async function handleAddToPlaylist(playlistId: string, playlistLabel: string) {
        if (!playlistsAvailable) {
            setError("Плейлисты пока недоступны: миграция базы данных еще не применена.");
            closeAddToPlaylistPopover();
            return;
        }

        if (!addToPlaylistMediaId || isAddingToPlaylist) {
            return;
        }

        setIsAddingToPlaylist(true);
        setError(null);

        try {
            await addCurrentTrackToPlaylist(playlistId, addToPlaylistMediaId);
            setStatus(`Добавлено в «${playlistLabel}»`);
            closeAddToPlaylistPopover();
        } catch (addError) {
            setError(addError instanceof Error ? addError.message : "Не удалось добавить трек в плейлист.");
        } finally {
            setIsAddingToPlaylist(false);
        }
    }

    async function handleCreatePlaylistAndAdd() {
        if (!playlistsAvailable) {
            setError("Плейлисты пока недоступны: миграция базы данных еще не применена.");
            closeAddToPlaylistPopover();
            return;
        }

        if (!addToPlaylistMediaId || isAddingToPlaylist || !newPlaylistDraftName.trim()) {
            return;
        }

        setIsAddingToPlaylist(true);
        setError(null);

        try {
            const result = await createPlaylistByName(newPlaylistDraftName);
            await addCurrentTrackToPlaylist(result.playlist.id, addToPlaylistMediaId);
            setStatus(`Создан плейлист «${result.playlist.name}» и трек добавлен`);
            closeAddToPlaylistPopover();
        } catch (addError) {
            setError(addError instanceof Error ? addError.message : "Не удалось создать плейлист.");
        } finally {
            setIsAddingToPlaylist(false);
        }
    }

    async function handleRemovePlaylistItem() {
        if (!playlistsAvailable) {
            setError("Плейлисты пока недоступны: миграция базы данных еще не применена.");
            return;
        }

        if (!removingPlaylistItemId || isRemovingPlaylistItem) {
            return;
        }

        setIsRemovingPlaylistItem(true);
        setError(null);

        try {
            const payload = await requestJson(`/api/media/playlists/items/${removingPlaylistItemId}`, "DELETE");
            setPlaylistItemsState((current) => current.filter((item) => item.id !== removingPlaylistItemId));
            setStatus(payload.message || "Трек удален из плейлиста.");
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : "Не удалось удалить трек из плейлиста.");
        } finally {
            setIsRemovingPlaylistItem(false);
            setRemovingPlaylistItemId(null);
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
        const files = Array.from(event.dataTransfer.files).filter((file) => file.size > 0 && file.type.startsWith("audio/"));
        if (files.length) {
            void uploadFiles(files);
        }
    }

    function renderAudioRow(asset: MediaAssetRecord, options?: { source?: AudioPlaybackSource; indexLabel?: string; playlistItemId?: string }) {
        const source = options?.source || { type: "archive" as const };
        const isActive = activeTrackId === asset.id;
        const isTrackPlaying = isActive && isPlaying;
        const format = getAudioFormatLabel(asset.mime_type);
        const isAddToPlaylistPopoverOpen = addToPlaylistMediaId === asset.id;

        return (
            <div
                key={options?.playlistItemId || asset.id}
                className={`audio-archive-row${isActive ? " audio-archive-row-active" : ""}`}
                role="listitem"
            >
                <button
                    type="button"
                    className="audio-archive-play-btn"
                    onClick={() => handleTrackToggle(asset.id, source)}
                    aria-label={isTrackPlaying ? "Пауза" : "Воспроизвести"}
                >
                    {isTrackPlaying ? (
                        <Pause className="audio-control-svg audio-control-svg-pause" aria-hidden="true" />
                    ) : (
                        <Play className="audio-control-svg audio-control-svg-play" aria-hidden="true" />
                    )}
                </button>

                <span className="audio-archive-index">{options?.indexLabel || "•"}</span>
                <span className="audio-archive-title">{asset.title || "Без названия"}</span>
                {format ? <span className="audio-archive-format">{format}</span> : null}
                {asset.size_bytes ? <span className="audio-archive-size">{formatFileSize(asset.size_bytes)}</span> : null}

                <div className="audio-archive-actions">
                    <a
                        href={buildMediaUrl(asset.id, shareToken, { download: true })}
                        className="audio-archive-action-btn"
                        aria-label="Скачать"
                        title="Скачать"
                    >
                        ↓
                    </a>
                    {canEdit && source.type === "archive" ? (
                        <Popover
                            open={isAddToPlaylistPopoverOpen}
                            onOpenChange={(open) => {
                                if (open) {
                                    setAddToPlaylistMediaId(asset.id);
                                    setNewPlaylistDraftName("");
                                    setIsCreatingPlaylistInline(false);
                                    return;
                                }

                                closeAddToPlaylistPopover();
                            }}
                        >
                            <PopoverTrigger
                                className="audio-archive-action-btn audio-archive-action-btn-text"
                                disabled={!playlistsAvailable}
                                aria-label="В плейлист"
                                title={!playlistsAvailable ? "Плейлисты пока недоступны" : "Добавить в плейлист"}
                            >
                                В плейлист
                            </PopoverTrigger>
                            <PopoverContent className="audio-playlist-popover" align="end" side="bottom" sideOffset={8}>
                                {isCreatingPlaylistInline ? (
                                    <div className="audio-playlist-popover-create">
                                        <input
                                            ref={newPlaylistInputRef}
                                            type="text"
                                            className="audio-playlist-input audio-playlist-inline-input"
                                            value={newPlaylistDraftName}
                                            onChange={(event) => setNewPlaylistDraftName(event.target.value)}
                                            onKeyDown={handleInlinePlaylistInputKeyDown}
                                            placeholder="Название плейлиста"
                                            maxLength={120}
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="audio-playlist-popover-submit"
                                            disabled={isAddingToPlaylist || !newPlaylistDraftName.trim()}
                                            onClick={() => void handleCreatePlaylistAndAdd()}
                                        >
                                            {isAddingToPlaylist ? "Создаю..." : "Создать"}
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        {playlistsState.length ? (
                                            <div className="audio-playlist-popover-list" role="list">
                                                {playlistsState.map((playlist) => (
                                                    <button
                                                        key={playlist.id}
                                                        type="button"
                                                        className="audio-playlist-popover-item"
                                                        aria-label={`Добавить в плейлист «${playlist.name}»`}
                                                        disabled={isAddingToPlaylist}
                                                        onClick={() => void handleAddToPlaylist(playlist.id, playlist.name)}
                                                    >
                                                        <span>{playlist.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}

                                        {playlistsState.length ? <div className="audio-playlist-popover-divider" aria-hidden="true" /> : null}
                                        <button
                                            type="button"
                                            className="audio-playlist-popover-new"
                                            disabled={isAddingToPlaylist}
                                            onClick={() => setIsCreatingPlaylistInline(true)}
                                        >
                                            + Новый плейлист
                                        </button>
                                    </>
                                )}
                            </PopoverContent>
                        </Popover>
                    ) : null}
                    {canEdit && options?.playlistItemId ? (
                        <button
                            type="button"
                            className="audio-archive-action-btn audio-archive-action-btn-text"
                            onClick={() => setRemovingPlaylistItemId(options.playlistItemId || null)}
                            title="Убрать из плейлиста"
                        >
                            Убрать
                        </button>
                    ) : null}
                    {canEdit && source.type === "archive" ? (
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
    }

    const hasAudioWorkspace = media.length > 0 || playlistsState.length > 0 || canEdit;

    return (
        <div className={`audio-archive${activeTrackId ? " audio-archive-has-player" : ""}`}>
            {canEdit ? (
                <input
                    id={audioFileInputId}
                    ref={fileInputRef}
                    className="builder-native-file-input"
                    type="file"
                    multiple
                    accept="audio/*"
                    onChange={handleFileSelection}
                />
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}

            {isUploading && uploadProgress ? (
                <div className="audio-archive-upload-status">
                    <span>{uploadProgress}</span>
                </div>
            ) : null}

            {!playlistsAvailable ? (
                <div className="audio-archive-upload-status" role="status" aria-live="polite">
                    <span>Плейлисты пока недоступны: миграция базы данных еще не применена.</span>
                </div>
            ) : null}

            {!hasAudioWorkspace && !isUploading ? (
                <div className="audio-archive-empty">
                    <div className="audio-archive-empty-icon">🎵</div>
                    <strong>Аудиозаписей пока нет</strong>
                    <p>Загрузите аудиофайлы — голосовые записи, интервью, музыку.</p>
                    {canEdit ? (
                        <>
                            <label htmlFor={audioFileInputId} className={buttonVariants({ variant: "secondary" })}>
                                Загрузить аудио
                            </label>
                        </>
                    ) : null}
                </div>
            ) : null}

            {hasAudioWorkspace ? (
                <>
                    <Tabs value={sectionView} onValueChange={handleSectionViewChange}>
                        <TabsList variant="line" aria-label="Режим аудиораздела">
                            <TabsTrigger className={`pill-link${sectionView === "all" ? " pill-link-active" : ""}`} value="all">
                                Все аудио
                            </TabsTrigger>
                            <TabsTrigger
                                className={`pill-link${sectionView === "playlists" ? " pill-link-active" : ""}`}
                                value="playlists"
                                disabled={!playlistsAvailable}
                            >
                                Плейлисты
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {sectionView === "all" ? (
                        media.length ? (
                            <>
                                <div className="audio-archive-list" role="list">
                                    {media.map((asset, index) =>
                                        renderAudioRow(asset, {
                                            source: { type: "archive" },
                                            indexLabel: String(index + 1),
                                        })
                                    )}
                                </div>

                                {canEdit ? (
                                    null
                                ) : null}
                            </>
                        ) : (
                            <div className="audio-archive-empty">
                                <div className="audio-archive-empty-icon">🎵</div>
                                <strong>Аудиозаписей пока нет</strong>
                                <p>Загрузите аудиофайлы — голосовые записи, интервью, музыку.</p>
                                {canEdit ? (
                                    <>
                                        <label htmlFor={audioFileInputId} className={buttonVariants({ variant: "secondary" })}>
                                            Загрузить аудио
                                        </label>
                                    </>
                                ) : null}
                            </div>
                        )
                    ) : selectedPlaylist ? (
                        <div className="audio-playlist-detail">
                            <div className="audio-playlist-detail-header">
                                <div className="audio-playlist-detail-copy">
                                    <Button type="button" variant="ghost" onClick={closePlaylistDetail}>
                                        ← К списку
                                    </Button>
                                    <strong>{selectedPlaylist.name}</strong>
                                    <span>{formatTrackCount(selectedPlaylistTracks.length)}</span>
                                </div>
                                {canEdit ? (
                                    <Button type="button" variant="destructive" onClick={() => setDeletePlaylistId(selectedPlaylist.id)}>
                                        Удалить плейлист
                                    </Button>
                                ) : null}
                            </div>

                            {selectedPlaylistTracks.length ? (
                                <div className="audio-archive-list" role="list">
                                    {selectedPlaylistTracks.map((row) =>
                                        renderAudioRow(row.media, {
                                            source: { type: "playlist", playlistId: row.playlistId },
                                            indexLabel: String(row.position),
                                            playlistItemId: row.playlistItemId,
                                        })
                                    )}
                                </div>
                            ) : (
                                <div className="audio-playlist-empty">
                                    <strong>В этом плейлисте пока нет треков</strong>
                                    <p>Добавьте сюда аудио из раздела «Все аудио».</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {canEdit ? (
                                <div className="audio-playlist-create">
                                    <label className="audio-playlist-field">
                                        <span>Новый плейлист</span>
                                        <input
                                            type="text"
                                            className="audio-playlist-input"
                                            value={playlistName}
                                            onChange={(event) => setPlaylistName(event.target.value)}
                                            placeholder="Например, Колыбельные"
                                            maxLength={120}
                                        />
                                    </label>
                                    <Button type="button" onClick={() => void handleCreatePlaylist()} disabled={isCreatingPlaylist || !playlistName.trim()}>
                                        {isCreatingPlaylist ? "Создаю..." : "Создать плейлист"}
                                    </Button>
                                </div>
                            ) : null}

                            {playlistsState.length ? (
                                <div className="audio-playlist-list" role="list">
                                    {playlistsState.map((playlist) => {
                                        const trackCount = playlistTrackRowsByPlaylistId.get(playlist.id)?.length || 0;
                                        return (
                                            <div key={playlist.id} className="audio-playlist-row" role="listitem">
                                                <button type="button" className="audio-playlist-open" onClick={() => openPlaylistDetail(playlist.id)}>
                                                    <strong>{playlist.name}</strong>
                                                    <span>{formatTrackCount(trackCount)}</span>
                                                </button>
                                                {canEdit ? (
                                                    <Button type="button" variant="ghost" onClick={() => setDeletePlaylistId(playlist.id)}>
                                                        Удалить
                                                    </Button>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="audio-playlist-empty">
                                    <strong>Плейлистов пока нет</strong>
                                    <p>Соберите сохраненные наборы треков для песен, интервью или семейных записей.</p>
                                </div>
                            )}
                        </>
                    )}
                </>
            ) : null}

            {canEdit && sectionView === "all" ? (
                <div
                    className={`audio-archive-dropzone${isDragging ? " audio-archive-dropzone-active" : ""}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <p>
                        Перетащите файлы сюда или{" "}
                        <label htmlFor={audioFileInputId} className="audio-archive-dropzone-btn">
                            выберите
                        </label>
                    </p>
                </div>
            ) : null}

            <AudioPlayer
                tracks={playbackTracks}
                activeTrackId={activeTrackId}
                isPlaying={isPlaying}
                activePlaybackSource={playbackSource}
                playbackSourceLabel={playbackSourceLabel}
                playbackSourceOptions={playbackSourceOptions}
                shareToken={shareToken}
                onTrackChange={handleTrackChange}
                onPlayingChange={handlePlayingChange}
                onPlaybackSourceSelect={handlePlaybackSourceSelect}
                onOpenPlaylists={playlistsAvailable ? openPlaylistsOverview : null}
            />

            {deletePlaylistId ? (
                <div className="audio-archive-confirm-overlay" onClick={() => setDeletePlaylistId(null)}>
                    <div className="audio-archive-confirm-dialog" onClick={(event) => event.stopPropagation()}>
                        <strong>Удалить плейлист?</strong>
                        <p>Все связи с треками будут удалены вместе с плейлистом.</p>
                        <div className="audio-archive-confirm-actions">
                            <Button type="button" variant="secondary" onClick={() => setDeletePlaylistId(null)}>
                                Отмена
                            </Button>
                            <Button type="button" variant="destructive" onClick={() => void handleDeletePlaylist()}>
                                {isDeletingPlaylist ? "Удаляю..." : "Удалить"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {removingPlaylistItemId ? (
                <div className="audio-archive-confirm-overlay" onClick={() => setRemovingPlaylistItemId(null)}>
                    <div className="audio-archive-confirm-dialog" onClick={(event) => event.stopPropagation()}>
                        <strong>Убрать трек из плейлиста?</strong>
                        <p>Аудиофайл останется в архиве и в других плейлистах, если они есть.</p>
                        <div className="audio-archive-confirm-actions">
                            <Button type="button" variant="secondary" onClick={() => setRemovingPlaylistItemId(null)}>
                                Отмена
                            </Button>
                            <Button type="button" variant="destructive" onClick={() => void handleRemovePlaylistItem()}>
                                {isRemovingPlaylistItem ? "Убираю..." : "Убрать"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {deleteTargetId ? (
                <div className="audio-archive-confirm-overlay" onClick={() => setDeleteTargetId(null)}>
                    <div className="audio-archive-confirm-dialog" onClick={(event) => event.stopPropagation()}>
                        <strong>Удалить аудиозапись?</strong>
                        <p>Это действие нельзя отменить.</p>
                        <div className="audio-archive-confirm-actions">
                            <Button type="button" variant="secondary" onClick={() => setDeleteTargetId(null)}>
                                Отмена
                            </Button>
                            <Button type="button" variant="destructive" onClick={() => void handleDeleteAudio()}>
                                Удалить
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {status ? (
                <div className="builder-status-toast" role="status" aria-live="polite">
                    {status}
                </div>
            ) : null}

            {canEdit ? (
                <label htmlFor={audioFileInputId} className="media-upload-fab" title="Загрузить" aria-label="Загрузить">
                    <FilePlus className="media-upload-fab-icon" aria-hidden="true" />
                    <span className="sr-only">Загрузить</span>
                </label>
            ) : null}
        </div>
    );
}
