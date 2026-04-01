import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

// --- resolveMediaKindFromMimeType tests ---
// We can't import the private function directly, so we test the public surface
// that depends on it: the type system and display helpers.

import { AudioArchiveView } from "@/components/media/audio-archive-view";
import type { MediaKind } from "@/lib/types";
import { collectTreeMedia } from "@/lib/tree/display";
import { formatMediaKind } from "@/lib/ui-text";

describe("MediaKind type", () => {
    it("includes audio as a valid value", () => {
        const kind: MediaKind = "audio";
        expect(kind).toBe("audio");
    });

    it("includes document as a valid value", () => {
        const kind: MediaKind = "document";
        expect(kind).toBe("document");
    });
});

describe("formatMediaKind", () => {
    it("returns Аудио for audio kind", () => {
        expect(formatMediaKind("audio")).toBe("Аудио");
    });

    it("returns Документ for document kind", () => {
        expect(formatMediaKind("document")).toBe("Документ");
    });

    it("returns Фото for photo kind (regression)", () => {
        expect(formatMediaKind("photo")).toBe("Фото");
    });

    it("returns Видео for video kind (regression)", () => {
        expect(formatMediaKind("video")).toBe("Видео");
    });
});

describe("collectTreeMedia", () => {
    const media = [
        { id: "1", kind: "photo", title: "photo1" },
        { id: "2", kind: "video", title: "video1" },
        { id: "3", kind: "audio", title: "audio1" },
        { id: "4", kind: "audio", title: "audio2" },
        { id: "5", kind: "document", title: "doc1" },
        { id: "6", kind: "document", title: "doc2" },
        { id: "7", kind: "photo", title: "photo2" },
    ] as any;

    const snapshot = { media };

    it("returns only audio assets when kind is audio", () => {
        const result = collectTreeMedia(snapshot, "audio");
        expect(result).toHaveLength(2);
        expect(result.every((a: any) => a.kind === "audio")).toBe(true);
    });

    it("returns only document assets when kind is document", () => {
        const result = collectTreeMedia(snapshot, "document");
        expect(result).toHaveLength(2);
        expect(result.every((a: any) => a.kind === "document")).toBe(true);
    });

    it("returns only photo assets when kind is photo (regression)", () => {
        const result = collectTreeMedia(snapshot, "photo");
        expect(result).toHaveLength(2);
        expect(result.every((a: any) => a.kind === "photo")).toBe(true);
    });

    it("returns only video assets when kind is video (regression)", () => {
        const result = collectTreeMedia(snapshot, "video");
        expect(result).toHaveLength(1);
        expect(result[0].kind).toBe("video");
    });

    it("returns all assets when kind is undefined", () => {
        const result = collectTreeMedia(snapshot);
        expect(result).toHaveLength(7);
    });
});

function createAudioAsset(id: string, title: string) {
    return {
        id,
        tree_id: "tree-1",
        kind: "audio",
        provider: "cloudflare_r2",
        visibility: "members",
        storage_path: `trees/tree-1/media/audio/${id}/${title}.mp3`,
        external_url: null,
        title,
        caption: null,
        mime_type: "audio/mpeg",
        size_bytes: 1024,
        created_by: "user-1",
        created_at: "2026-04-01T00:00:00.000Z",
        preview_status: null,
        preview_error: null,
        preview_attempt_count: 0,
        preview_claimed_at: null,
    } as const;
}

function mockAudioPlayback() {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
    });
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("pause"));
    });

    return { playSpy, pauseSpy };
}

describe("Audio archive player state", () => {
    it("keeps the player visible when pausing from the list", () => {
        const { playSpy, pauseSpy } = mockAudioPlayback();
        const media = [
            createAudioAsset("audio-1", "Аудио 1"),
            createAudioAsset("audio-2", "Аудио 2"),
        ];

        const view = render(
            createElement(AudioArchiveView, {
                treeId: "tree-1",
                slug: "test-tree",
                canEdit: false,
                media: media as any,
                onMediaChange: () => undefined,
            })
        );

        const firstRow = screen.getByText("Аудио 1", { selector: ".audio-archive-title" }).closest(".audio-archive-row");
        expect(firstRow).not.toBeNull();

        fireEvent.click(within(firstRow as HTMLElement).getByRole("button", { name: "Воспроизвести" }));

        expect(screen.getByRole("region", { name: "Аудиоплеер" })).toBeInTheDocument();
        expect(firstRow).toHaveClass("audio-archive-row-active");
        expect(view.container.firstElementChild).toHaveClass("audio-archive-has-player");
        expect(within(firstRow as HTMLElement).getByRole("button", { name: "Пауза" })).toBeInTheDocument();
        expect(playSpy).toHaveBeenCalled();

        fireEvent.click(within(firstRow as HTMLElement).getByRole("button", { name: "Пауза" }));

        expect(screen.getByRole("region", { name: "Аудиоплеер" })).toBeInTheDocument();
        expect(firstRow).toHaveClass("audio-archive-row-active");
        expect(view.container.firstElementChild).toHaveClass("audio-archive-has-player");
        expect(within(firstRow as HTMLElement).getByRole("button", { name: "Воспроизвести" })).toBeInTheDocument();
        expect(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByRole("button", { name: "Воспроизвести" })).toBeInTheDocument();
        expect(pauseSpy).toHaveBeenCalled();
    });

    it("keeps list and player controls in sync while switching tracks", () => {
        mockAudioPlayback();
        const media = [
            createAudioAsset("audio-1", "Аудио 1"),
            createAudioAsset("audio-2", "Аудио 2"),
        ];

        render(
            createElement(AudioArchiveView, {
                treeId: "tree-1",
                slug: "test-tree",
                canEdit: false,
                media: media as any,
                onMediaChange: () => undefined,
            })
        );

        const firstRow = screen.getByText("Аудио 1", { selector: ".audio-archive-title" }).closest(".audio-archive-row");
        const secondRow = screen.getByText("Аудио 2", { selector: ".audio-archive-title" }).closest(".audio-archive-row");
        expect(firstRow).not.toBeNull();
        expect(secondRow).not.toBeNull();

        fireEvent.click(within(firstRow as HTMLElement).getByRole("button", { name: "Воспроизвести" }));
        const player = screen.getByRole("region", { name: "Аудиоплеер" });
        expect(within(player).getByText("Аудио 1")).toBeInTheDocument();

        fireEvent.click(within(player).getByRole("button", { name: "Пауза" }));
        expect(within(firstRow as HTMLElement).getByRole("button", { name: "Воспроизвести" })).toBeInTheDocument();

        fireEvent.click(within(player).getByRole("button", { name: "Воспроизвести" }));
        expect(within(firstRow as HTMLElement).getByRole("button", { name: "Пауза" })).toBeInTheDocument();

        fireEvent.click(within(player).getByRole("button", { name: "Следующий трек" }));
        expect(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByText("Аудио 2")).toBeInTheDocument();
        expect(secondRow).toHaveClass("audio-archive-row-active");
        expect(within(secondRow as HTMLElement).getByRole("button", { name: "Пауза" })).toBeInTheDocument();
        expect(within(firstRow as HTMLElement).getByRole("button", { name: "Воспроизвести" })).toBeInTheDocument();

        fireEvent.click(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByRole("button", { name: "Предыдущий трек" }));
        expect(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByText("Аудио 1")).toBeInTheDocument();
        expect(firstRow).toHaveClass("audio-archive-row-active");
    });
});
