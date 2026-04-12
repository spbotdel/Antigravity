"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AudioPlaybackSource, MediaAssetRecord } from "@/lib/types";

interface AudioPlayerProps {
    tracks: MediaAssetRecord[];
    activeTrackId: string | null;
    isPlaying: boolean;
    activePlaybackSource: AudioPlaybackSource;
    playbackSourceLabel: string;
    playbackSourceOptions: Array<{
        label: string;
        source: AudioPlaybackSource;
    }>;
    shareToken?: string | null;
    onTrackChange: (id: string) => void;
    onPlayingChange: (isPlaying: boolean) => void;
    onPlaybackSourceSelect: (source: AudioPlaybackSource) => void;
    onOpenPlaylists?: (() => void) | null;
    onHeightChange?: ((height: number) => void) | null;
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

function formatTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function buildMediaStreamUrl(mediaId: string, shareToken?: string | null) {
    const params = new URLSearchParams();
    if (shareToken) {
        params.set("share", shareToken);
    }

    return params.size ? `/api/media/${mediaId}?${params.toString()}` : `/api/media/${mediaId}`;
}

function pauseAudio(audio: HTMLAudioElement) {
    try {
        audio.pause();
    } catch {
        // jsdom does not implement real media playback; ignore pause failures there.
    }
}

export function AudioPlayer({
    tracks,
    activeTrackId,
    isPlaying,
    activePlaybackSource,
    playbackSourceLabel,
    playbackSourceOptions,
    shareToken,
    onTrackChange,
    onPlayingChange,
    onPlaybackSourceSelect,
    onOpenPlaylists,
    onHeightChange,
}: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const loadedTrackUrlRef = useRef<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isPlaybackSourceMenuOpen, setIsPlaybackSourceMenuOpen] = useState(false);

    const activeTrack = tracks.find((t) => t.id === activeTrackId) ?? null;
    const activeIndex = activeTrack ? tracks.indexOf(activeTrack) : -1;
    const canSwitchPlaybackSource = playbackSourceOptions.length > 1 || Boolean(onOpenPlaylists);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        if (!activeTrack) {
            pauseAudio(audio);
            loadedTrackUrlRef.current = null;
            setCurrentTime(0);
            setDuration(0);
            setError(null);
            return;
        }

        const trackUrl = buildMediaStreamUrl(activeTrack.id, shareToken);
        if (loadedTrackUrlRef.current !== trackUrl) {
            audio.src = trackUrl;
            audio.load();
            loadedTrackUrlRef.current = trackUrl;
            setCurrentTime(0);
            setDuration(0);
            setError(null);
        }

        if (isPlaying) {
            try {
                const playResult = audio.play();
                if (playResult && typeof playResult.catch === "function") {
                    playResult.catch(() => {
                        onPlayingChange(false);
                    });
                }
            } catch {
                onPlayingChange(false);
            }
            return;
        }

        pauseAudio(audio);
    }, [activeTrack, isPlaying, onPlayingChange, shareToken]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        function handleTimeUpdate() {
            setCurrentTime(audio!.currentTime);
        }

        function handleDurationChange() {
            setDuration(audio!.duration);
        }

        function handleEnded() {
            if (activeIndex >= 0 && activeIndex < tracks.length - 1) {
                onTrackChange(tracks[activeIndex + 1].id);
            } else {
                const currentAudio = audioRef.current;
                if (currentAudio) {
                    currentAudio.currentTime = 0;
                }
                setCurrentTime(0);
                onPlayingChange(false);
            }
        }

        function handleError() {
            setError("Не удалось воспроизвести аудио");
            onPlayingChange(false);
        }

        function handlePlay() {
            setError(null);
            onPlayingChange(true);
        }

        function handlePause() {
            onPlayingChange(false);
        }

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("durationchange", handleDurationChange);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);
        audio.addEventListener("play", handlePlay);
        audio.addEventListener("pause", handlePause);

        return () => {
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("durationchange", handleDurationChange);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("error", handleError);
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("pause", handlePause);
        };
    }, [activeIndex, onPlayingChange, onTrackChange, tracks]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root || !onHeightChange) {
            return;
        }

        const reportHeight = () => {
            onHeightChange(Math.round(root.getBoundingClientRect().height));
        };

        reportHeight();

        const resizeObserver =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(() => {
                    reportHeight();
                });

        resizeObserver?.observe(root);
        window.addEventListener("resize", reportHeight);

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener("resize", reportHeight);
            onHeightChange(0);
        };
    }, [onHeightChange]);

    const togglePlayPause = useCallback(() => {
        onPlayingChange(!isPlaying);
    }, [isPlaying, onPlayingChange]);

    const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        const value = Number(event.target.value);
        audio.currentTime = value;
        setCurrentTime(value);
    }, []);

    const playPrev = useCallback(() => {
        if (activeIndex > 0) {
            onTrackChange(tracks[activeIndex - 1].id);
        }
    }, [activeIndex, tracks, onTrackChange]);

    const playNext = useCallback(() => {
        if (activeIndex >= 0 && activeIndex < tracks.length - 1) {
            onTrackChange(tracks[activeIndex + 1].id);
        }
    }, [activeIndex, tracks, onTrackChange]);

    if (!activeTrack) {
        return null;
    }

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div ref={rootRef} className="audio-player" role="region" aria-label="Аудиоплеер">
            <audio ref={audioRef} preload="metadata" />

            <div className="audio-player-main">
                <div className="audio-player-controls">
                    <button
                        type="button"
                        className="audio-player-btn"
                        onClick={playPrev}
                        disabled={activeIndex <= 0}
                        aria-label="Предыдущий трек"
                    >
                        <SkipBack className="audio-control-svg audio-control-svg-skip" aria-hidden="true" />
                    </button>

                    <button
                        type="button"
                        className="audio-player-btn audio-player-btn-play"
                        onClick={togglePlayPause}
                        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
                    >
                        {isPlaying ? (
                            <Pause className="audio-control-svg audio-control-svg-pause" aria-hidden="true" />
                        ) : (
                            <Play className="audio-control-svg audio-control-svg-play" aria-hidden="true" />
                        )}
                    </button>

                    <button
                        type="button"
                        className="audio-player-btn"
                        onClick={playNext}
                        disabled={activeIndex >= tracks.length - 1}
                        aria-label="Следующий трек"
                    >
                        <SkipForward className="audio-control-svg audio-control-svg-skip" aria-hidden="true" />
                    </button>
                </div>

                <div className="audio-player-context">
                    {canSwitchPlaybackSource ? (
                        <Popover open={isPlaybackSourceMenuOpen} onOpenChange={setIsPlaybackSourceMenuOpen}>
                            <PopoverTrigger
                                className="audio-player-source audio-player-source-button"
                                aria-label={`Источник воспроизведения: ${playbackSourceLabel}`}
                            >
                                <span className="audio-player-source-label">{playbackSourceLabel}</span>
                                <span className="audio-player-source-caret" aria-hidden="true">
                                    ▾
                                </span>
                            </PopoverTrigger>
                            <PopoverContent className="audio-player-source-popover" align="start" side="top" sideOffset={10}>
                                {playbackSourceOptions.map((option) => {
                                    const isActiveSource = isSamePlaybackSource(activePlaybackSource, option.source);

                                    return (
                                        <button
                                            key={option.source.type === "playlist" ? option.source.playlistId : "archive"}
                                            type="button"
                                            className={`audio-player-source-option${isActiveSource ? " audio-player-source-option-active" : ""}`}
                                            aria-label={`Источник воспроизведения: ${option.label}`}
                                            onClick={() => {
                                                onPlaybackSourceSelect(option.source);
                                                setIsPlaybackSourceMenuOpen(false);
                                            }}
                                        >
                                            <span className={`audio-player-source-option-check${isActiveSource ? " audio-player-source-option-check-active" : ""}`} aria-hidden="true">
                                                ✓
                                            </span>
                                            <span className="audio-player-source-option-label">{option.label}</span>
                                        </button>
                                    );
                                })}
                                {onOpenPlaylists ? (
                                    <>
                                        <div className="audio-player-source-divider" aria-hidden="true" />
                                        <button
                                            type="button"
                                            className="audio-player-source-action"
                                            onClick={() => {
                                                onOpenPlaylists();
                                                setIsPlaybackSourceMenuOpen(false);
                                            }}
                                        >
                                            Открыть плейлисты
                                        </button>
                                    </>
                                ) : null}
                            </PopoverContent>
                        </Popover>
                    ) : (
                        <span className="audio-player-source">{playbackSourceLabel}</span>
                    )}

                    <span className="audio-player-title">{activeTrack.title || "Без названия"}</span>
                </div>
            </div>

            {error ? <span className="audio-player-error">{error}</span> : null}

            <div className="audio-player-seek">
                <span className="audio-player-time">{formatTime(currentTime)}</span>
                <input
                    type="range"
                    className="audio-player-range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                    aria-label="Прогресс воспроизведения"
                    style={{ "--audio-progress": `${progress}%` } as React.CSSProperties}
                />
                <span className="audio-player-time">{formatTime(duration)}</span>
            </div>
        </div>
    );
}
