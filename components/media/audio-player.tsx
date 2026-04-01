"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaAssetRecord } from "@/lib/types";

interface AudioPlayerProps {
    tracks: MediaAssetRecord[];
    activeTrackId: string | null;
    isPlaying: boolean;
    shareToken?: string | null;
    onTrackChange: (id: string) => void;
    onPlayingChange: (isPlaying: boolean) => void;
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

export function AudioPlayer({ tracks, activeTrackId, isPlaying, shareToken, onTrackChange, onPlayingChange }: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const loadedTrackUrlRef = useRef<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const activeTrack = tracks.find((t) => t.id === activeTrackId) ?? null;
    const activeIndex = activeTrack ? tracks.indexOf(activeTrack) : -1;

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
                audio.currentTime = 0;
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
        <div className="audio-player" role="region" aria-label="Аудиоплеер">
            <audio ref={audioRef} preload="metadata" />

            <div className="audio-player-controls">
                <button
                    type="button"
                    className="audio-player-btn"
                    onClick={playPrev}
                    disabled={activeIndex <= 0}
                    aria-label="Предыдущий трек"
                >
                    ⏮
                </button>

                <button
                    type="button"
                    className="audio-player-btn audio-player-btn-play"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
                >
                    {isPlaying ? "⏸" : "▶"}
                </button>

                <button
                    type="button"
                    className="audio-player-btn"
                    onClick={playNext}
                    disabled={activeIndex >= tracks.length - 1}
                    aria-label="Следующий трек"
                >
                    ⏭
                </button>
            </div>

            <div className="audio-player-info">
                <span className="audio-player-title">{activeTrack.title || "Без названия"}</span>
                {error ? <span className="audio-player-error">{error}</span> : null}
            </div>

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
