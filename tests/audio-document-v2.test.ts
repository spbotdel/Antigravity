import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

const { uploadFileWithTransportContract } = vi.hoisted(() => ({
    uploadFileWithTransportContract: vi.fn(async () => undefined),
}));

vi.mock("@/lib/utils", async () => {
    const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
    return {
        ...actual,
        uploadFileWithTransportContract,
    };
});

// --- resolveMediaKindFromMimeType tests ---
// We can't import the private function directly, so we test the public surface
// that depends on it: the type system and display helpers.

import { AudioArchiveView } from "@/components/media/audio-archive-view";
import { DocumentArchiveView } from "@/components/media/document-archive-view";
import { DocumentPreviewDialog } from "@/components/media/document-preview-dialog";
import { OfficeDocumentPreview, buildCloudflareOfficeDocumentPublicUrl, buildMicrosoftOfficeViewerUrl } from "@/components/media/office-document-preview";
import { buildAttachmentContentDisposition } from "@/lib/server/repository";
import type { MediaAssetRecord, MediaKind } from "@/lib/types";
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

function createDocumentAsset(overrides?: Partial<MediaAssetRecord>): MediaAssetRecord {
    return {
        id: "document-1",
        tree_id: "tree-1",
        kind: "document",
        provider: "cloudflare_r2",
        visibility: "members",
        storage_path: "trees/tree-1/media/document/document-1/family-history.docx",
        external_url: null,
        title: "family-history.docx",
        caption: null,
        mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size_bytes: 2048,
        created_by: "user-1",
        created_at: "2026-04-02T00:00:00.000Z",
        preview_status: null,
        preview_error: null,
        preview_attempt_count: 0,
        preview_claimed_at: null,
        ...overrides,
    } as MediaAssetRecord;
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
    it("uploads audio from the empty-state button flow", async () => {
        vi.spyOn(global, "fetch").mockImplementation(async (input) => {
            const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

            if (url.includes("/api/media/archive/upload-intent")) {
                return Response.json(
                    {
                        mediaId: "audio-upload-1",
                        kind: "audio",
                        path: "trees/tree-1/media/audio/audio-upload-1/original.mp3",
                        bucket: "bucket-1",
                        signedUrl: "https://example.com/audio.mp3",
                        token: null,
                        uploadProvider: "cloudflare_r2",
                        configuredBackend: "cloudflare_r2",
                        resolvedUploadBackend: "cloudflare_r2",
                        rolloutState: "cloudflare_rollout_active",
                        forceProxyUpload: true,
                        uploadMode: "proxy",
                        variantUploadMode: "none",
                        variantTargets: [],
                    },
                    { status: 201 }
                );
            }

            if (url.includes("/api/media/archive/complete")) {
                return Response.json(
                    {
                        media: createAudioAsset("audio-upload-1", "voice-note.mp3"),
                        uploaderAlbumId: null,
                        message: "Материал сохранен в семейный архив.",
                    },
                    { status: 201 }
                );
            }

            return Response.json({}, { status: 200 });
        });

        const onMediaChange = vi.fn();
        const view = render(
            createElement(AudioArchiveView, {
                treeId: "tree-1",
                slug: "test-tree",
                canEdit: true,
                media: [] as any,
                onMediaChange,
            })
        );

        expect(screen.getByText("Загрузить аудио")).toBeInTheDocument();

        const input = view.container.querySelector('input[type="file"][accept="audio/*"]') as HTMLInputElement | null;
        expect(input).not.toBeNull();

        const file = new File([new Uint8Array([1, 2, 3])], "voice-note.mp3", { type: "audio/mpeg" });
        Object.defineProperty(input, "files", {
            configurable: true,
            value: [file],
        });
        fireEvent.change(input as HTMLInputElement);

        expect(await screen.findByText("Аудио загружено.")).toBeInTheDocument();
        expect(uploadFileWithTransportContract).toHaveBeenCalled();
        expect(onMediaChange).toHaveBeenCalledWith([
            expect.objectContaining({
                id: "audio-upload-1",
                kind: "audio",
            }),
        ]);
    });

    it("routes audio row download through explicit attachment mode", () => {
        const media = [createAudioAsset("audio-1", "Аудио 1")];

        render(
            createElement(AudioArchiveView, {
                treeId: "tree-1",
                slug: "test-tree",
                canEdit: false,
                media: media as any,
                onMediaChange: () => undefined,
            })
        );

        expect(screen.getByRole("link", { name: "Скачать" })).toHaveAttribute("href", "/api/media/audio-1?download=1");
    });

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

    it("shows unavailable playlist state and disables add-to-playlist actions when playlists are unavailable", () => {
        const media = [
            createAudioAsset("audio-1", "Аудио 1"),
            createAudioAsset("audio-2", "Аудио 2"),
        ];

        render(
            createElement(AudioArchiveView, {
                treeId: "tree-1",
                slug: "test-tree",
                canEdit: true,
                media: media as any,
                playlists: [],
                playlistItems: [],
                playlistsAvailable: false,
                onMediaChange: () => undefined,
            })
        );

        expect(screen.getByText("Плейлисты пока недоступны: миграция базы данных еще не применена.")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Плейлисты" })).toHaveAttribute("aria-disabled", "true");

        const addButtons = screen.getAllByRole("button", { name: "В плейлист" });
        expect(addButtons.length).toBeGreaterThan(0);
        expect(addButtons.every((button) => button.hasAttribute("disabled"))).toBe(true);
    });
});

describe("document preview integration", () => {
    it("builds a public Cloudflare Office document url from the configured base url", () => {
        const asset = createDocumentAsset({
            storage_path: "trees/tree 1/media/document/document-1/family history.docx",
        });

        expect(buildCloudflareOfficeDocumentPublicUrl(asset, "https://media.example.com/archive/")).toBe(
            "https://media.example.com/archive/trees/tree%201/media/document/document-1/family%20history.docx"
        );
    });

    it("keeps the existing direct preview path for pdf files", () => {
        render(
            createElement(DocumentPreviewDialog, {
                asset: createDocumentAsset({
                    id: "document-pdf",
                    title: "family-book.pdf",
                    mime_type: "application/pdf",
                    storage_path: "trees/tree-1/media/document/document-pdf/family-book.pdf",
                }),
                shareToken: "share-token",
                cloudflareR2PublicBaseUrl: "https://media.example.com/archive",
                open: true,
                onClose: () => undefined,
            })
        );

        const iframe = document.querySelector(".document-preview-iframe");
        expect(iframe).not.toBeNull();
        expect(iframe).toHaveAttribute("src", "/api/media/document-pdf?share=share-token");
        expect(screen.getByRole("link", { name: "Скачать" })).toHaveAttribute("href", "/api/media/document-pdf?download=1&share=share-token");
    });

    it("shows an Office preview entrypoint for docx only when a public Cloudflare url can be built", () => {
        render(
            createElement(DocumentArchiveView, {
                treeId: "tree-1",
                slug: "demo-family",
                canEdit: false,
                media: [createDocumentAsset()],
                cloudflareR2PublicBaseUrl: "https://media.example.com/archive",
                onMediaChange: () => undefined,
            })
        );

        expect(screen.getByRole("button", { name: "Открыть" })).toBeInTheDocument();
        expect(document.querySelector('.document-archive-actions a[href="/api/media/document-1?download=1"]')).not.toBeNull();
    });

    it("keeps docx download-only when the public Cloudflare base url is missing", () => {
        render(
            createElement(DocumentArchiveView, {
                treeId: "tree-1",
                slug: "demo-family",
                canEdit: false,
                media: [createDocumentAsset()],
                onMediaChange: () => undefined,
            })
        );

        expect(screen.queryByRole("button", { name: "Открыть" })).toBeNull();
    });

    it("routes pdf row download through explicit attachment mode", () => {
        render(
            createElement(DocumentArchiveView, {
                treeId: "tree-1",
                slug: "demo-family",
                canEdit: false,
                media: [createDocumentAsset({
                    id: "document-pdf",
                    title: "family-book.pdf",
                    mime_type: "application/pdf",
                    storage_path: "trees/tree-1/media/document/document-pdf/family-book.pdf",
                })],
                onMediaChange: () => undefined,
            })
        );

        const pdfDownloadLink = document.querySelector('.document-archive-actions a[href="/api/media/document-pdf?download=1"]');
        expect(pdfDownloadLink).not.toBeNull();
    });

    it("renders the Microsoft Office viewer url for docx preview", () => {
        render(
            createElement(DocumentPreviewDialog, {
                asset: createDocumentAsset(),
                cloudflareR2PublicBaseUrl: "https://media.example.com/archive",
                open: true,
                onClose: () => undefined,
            })
        );

        const iframe = document.querySelector(".document-preview-iframe");
        expect(iframe).not.toBeNull();
        expect(iframe).toHaveAttribute(
            "src",
            buildMicrosoftOfficeViewerUrl("https://media.example.com/archive/trees/tree-1/media/document/document-1/family-history.docx")
        );
        expect(screen.getByRole("link", { name: "Скачать" })).toHaveAttribute("href", "/api/media/document-1?download=1");
    });

    it("falls back when the Office viewer does not finish loading in time", async () => {
        vi.useFakeTimers();

        render(
            createElement(OfficeDocumentPreview, {
                publicFileUrl: "https://media.example.com/archive/trees/tree-1/media/document/document-1/family-history.docx",
                title: "family-history.docx",
                downloadUrl: "/api/media/document-1",
            })
        );

        expect(screen.getByText("Открываем документ через Microsoft viewer...")).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(7000);
        });

        expect(screen.getByText("Предпросмотр не загрузился")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Скачать файл" })).toHaveAttribute("href", "/api/media/document-1");
    });

    it("builds attachment content-disposition with ascii fallback and utf-8 filename*", () => {
        expect(buildAttachmentContentDisposition("КАЛЕНДАРЬ важных ДАТ семьи Русяйкиных.doc")).toBe(
            "attachment; filename=\"download.doc\"; filename*=UTF-8''%D0%9A%D0%90%D0%9B%D0%95%D0%9D%D0%94%D0%90%D0%A0%D0%AC%20%D0%B2%D0%B0%D0%B6%D0%BD%D1%8B%D1%85%20%D0%94%D0%90%D0%A2%20%D1%81%D0%B5%D0%BC%D1%8C%D0%B8%20%D0%A0%D1%83%D1%81%D1%8F%D0%B9%D0%BA%D0%B8%D0%BD%D1%8B%D1%85.doc"
        );
    });
});
