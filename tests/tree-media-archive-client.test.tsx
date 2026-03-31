import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { TreeMediaArchiveClient } from "@/components/media/tree-media-archive-client";
import type { MediaAssetRecord } from "@/lib/types";

function createMediaAsset(overrides: Partial<MediaAssetRecord>): MediaAssetRecord {
  return {
    id: "media-default",
    tree_id: "tree-1",
    kind: "photo",
    provider: "object_storage",
    visibility: "members",
    storage_path: "trees/tree-1/media/photo/media-default/file.jpg",
    external_url: null,
    title: "Default media",
    caption: "Default caption",
    mime_type: "image/jpeg",
    size_bytes: 1024,
    preview_status: null,
    preview_error: null,
    preview_attempt_count: 0,
    preview_claimed_at: null,
    created_by: "user-1",
    created_at: "2026-03-09T00:00:00.000Z",
    ...overrides,
  } as MediaAssetRecord;
}

function renderArchiveClient(options?: {
  allMedia?: MediaAssetRecord[];
  allAlbums?: Array<{
    id: string;
    title: string;
    description: string | null;
    kind?: "photo" | "video" | "all";
    access?: "public" | "members";
    albumKind: "manual" | "uploader";
    uploaderUserId: string | null;
    count: number;
    coverMediaId: string | null;
  }>;
  persistedAlbumMediaMap?: Record<string, MediaAssetRecord[]>;
  canEdit?: boolean;
  uploaderLabels?: Array<{ userId: string; label: string }>;
  initialMode?: "photo" | "video" | "all";
  initialView?: "all" | "albums";
  initialAlbumId?: string | null;
  initialThumbUrlsByMediaId?: Record<string, string>;
}) {
  const allMedia = options?.allMedia || [
    createMediaAsset({
      id: "media-photo",
      title: "Архивное фото",
      storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
    }),
    createMediaAsset({
      id: "media-video",
      kind: "video",
      title: "Архивное видео",
      mime_type: "video/mp4",
      storage_path: "trees/tree-1/media/video/media-video/archive-video.mp4",
    }),
    createMediaAsset({
      id: "media-external",
      kind: "video",
      provider: "yandex_disk",
      title: "Внешнее видео архива",
      storage_path: null,
      external_url: "https://example.com/archive-video",
    }),
  ];

  return render(
    <TreeMediaArchiveClient
      treeId="tree-1"
      slug="demo-family"
      canEdit={options?.canEdit ?? true}
      initialMode={options?.initialMode ?? "all"}
      initialView={options?.initialView ?? "all"}
      initialAlbumId={options?.initialAlbumId ?? null}
      allMedia={allMedia}
      allAlbums={(options?.allAlbums || []).map((album) => ({ ...album, kind: album.kind ?? "photo", access: album.access ?? "members" }))}
      persistedAlbumMediaMap={options?.persistedAlbumMediaMap || {}}
      initialThumbUrlsByMediaId={options?.initialThumbUrlsByMediaId || {}}
      uploaderLabels={options?.uploaderLabels || []}
    />
  );
}

describe("tree media archive client", () => {
  beforeEach(() => {
    uploadFileWithTransportContract.mockClear();
    vi.restoreAllMocks();
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => "blob:test");
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens archive media in a large viewer and navigates to an external video", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());

    renderArchiveClient();

    fireEvent.click(screen.getByRole("button", { name: "Открыть фото: Архивное фото" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное фото" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass("media-lightbox");
    expect(dialog.querySelector("img.person-media-stage-photo")).not.toBeNull();
    expect(document.querySelector(".archive-media-dialog")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Следующее медиа" }));
    const videoDialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
    const stageVideo = videoDialog.querySelector("video.person-media-stage-video") as HTMLVideoElement | null;
    expect(stageVideo).not.toBeNull();
    expect(stageVideo?.hasAttribute("controls")).toBe(false);
    expect(stageVideo?.muted).toBe(false);
    expect(stageVideo?.autoplay).toBe(true);
    expect(stageVideo?.preload).toBe("metadata");
    expect(playSpy).toHaveBeenCalled();
    expect(within(videoDialog).getByRole("button", { name: "Воспроизвести видео" })).toBeInTheDocument();
    expect(within(videoDialog).getByLabelText("Позиция видео")).toBeInTheDocument();

    fireEvent.click(within(videoDialog).getByRole("button", { name: "Следующее медиа" }));
    const externalDialog = screen.getByRole("dialog", { name: "Просмотр архива: Внешнее видео архива" });
    expect(within(externalDialog).getAllByRole("link", { name: "Открыть внешнее видео" })[0]).toHaveAttribute("href", "/api/media/media-external");
  }, 15000);

  it("falls back to original photo routes for legacy archive items without variants", async () => {
    renderArchiveClient({
      allMedia: [
        createMediaAsset({
          id: "media-legacy-photo",
          title: "Архивное фото",
          created_at: "2026-03-07T00:00:00.000Z",
          storage_path: "trees/tree-1/media/photo/media-legacy-photo/archive-photo.jpg",
        }),
      ],
      initialThumbUrlsByMediaId: {
        "media-legacy-photo": "https://example.com/legacy-photo-original.jpg",
      },
    });

    const tileImage = await screen.findByRole("img", { hidden: true }).catch(() => null);
    const firstArchiveImage = document.querySelector(".archive-tile-image");
    expect(tileImage || firstArchiveImage).not.toBeNull();
    expect(firstArchiveImage).toHaveAttribute("src", "https://example.com/legacy-photo-original.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Открыть фото: Архивное фото" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное фото" });
    expect(within(dialog).getByRole("img", { name: "Архивное фото" })).toHaveAttribute("src", "/api/media/media-legacy-photo");
  });

  it("uses pre-resolved initial thumb urls for the initial archive grid without hitting the thumb route", () => {
    renderArchiveClient({
      allMedia: [
        createMediaAsset({
          id: "media-photo",
          title: "Архивное фото",
          storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
        }),
      ],
      initialThumbUrlsByMediaId: {
        "media-photo": "https://example.com/direct-thumb.webp",
      },
    });

    const tileImage = document.querySelector(".archive-tile-image");
    expect(tileImage).not.toBeNull();
    expect(tileImage).toHaveAttribute("src", "https://example.com/direct-thumb.webp");
  });

  it("batch-resolves visible archive thumbs after hydration when initial direct urls are missing", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/api/media/thumbs") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body || "{}"));
        expect(payload).toMatchObject({
          treeId: "tree-1",
          mediaIds: ["media-photo"],
        });
        return Response.json({
          urlsByMediaId: {
            "media-photo": "https://example.com/hydrated-thumb.webp",
          },
        });
      }

      return Response.json({}, { status: 200 });
    });

    renderArchiveClient({
      allMedia: [
        createMediaAsset({
          id: "media-photo",
          title: "Архивное фото",
          storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
        }),
      ],
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/media/thumbs",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    await waitFor(() => {
      const tileImage = document.querySelector(".archive-tile-image");
      expect(tileImage).not.toBeNull();
      expect(tileImage).toHaveAttribute("src", "https://example.com/hydrated-thumb.webp");
    });
  });

  it("does not repeat the same visible-set thumb batch request while the first request is still pending", async () => {
    let resolveBatchRequest: ((value: Response) => void) | undefined;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/api/media/thumbs") && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveBatchRequest = resolve;
        });
      }

      return Promise.resolve(Response.json({}, { status: 200 }));
    });

    const media = [
      createMediaAsset({
        id: "media-photo",
        title: "Архивное фото",
        storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
      }),
    ];

    const view = render(
      <TreeMediaArchiveClient
        treeId="tree-1"
        slug="demo-family"
        canEdit
        initialMode="photo"
        initialView="all"
        initialAlbumId={null}
        allMedia={media}
        allAlbums={[]}
        persistedAlbumMediaMap={{}}
        initialThumbUrlsByMediaId={{}}
        uploaderLabels={[]}
      />
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <TreeMediaArchiveClient
        treeId="tree-1"
        slug="demo-family"
        canEdit
        initialMode="photo"
        initialView="all"
        initialAlbumId={null}
        allMedia={media}
        allAlbums={[]}
        persistedAlbumMediaMap={{}}
        initialThumbUrlsByMediaId={{}}
        uploaderLabels={[]}
      />
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(resolveBatchRequest).toBeDefined();
    await act(async () => {
      resolveBatchRequest!(
        Response.json({
          urlsByMediaId: {
            "media-photo": "https://example.com/hydrated-thumb.webp",
          },
        })
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      const tileImage = document.querySelector(".archive-tile-image");
      expect(tileImage).not.toBeNull();
      expect(tileImage).toHaveAttribute("src", "https://example.com/hydrated-thumb.webp");
    });
  });

  it("recovers the current photo grid after a partial thumb batch failure when the mode is retriggered", async () => {
    const media = Array.from({ length: 101 }, (_, index) =>
      createMediaAsset({
        id: `media-photo-${String(index + 1).padStart(3, "0")}`,
        title: `Фото ${index + 1}`,
        storage_path: `trees/tree-1/media/photo/media-photo-${String(index + 1).padStart(3, "0")}/photo.jpg`,
      })
    );
    const thumbRequests: Array<string[]> = [];
    let retrySucceeded = false;

    const requestIdleCallback = vi.fn(() => 1);
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal("requestIdleCallback", requestIdleCallback);
    vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/api/media/thumbs") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body || "{}"));
        const mediaIds = payload.mediaIds as string[];
        thumbRequests.push(mediaIds);

        const urlsByMediaId = Object.fromEntries(
          mediaIds.map((mediaId) => [mediaId, `https://example.com/thumbs/${mediaId}.webp`])
        );

        if (!retrySucceeded) {
          if (mediaIds.length === 100) {
            return Response.json({ urlsByMediaId });
          }

          return Response.json({ error: "thumb batch failed" }, { status: 500 });
        }

        return Response.json({ urlsByMediaId });
      }

      return Response.json({}, { status: 200 });
    });

    const view = renderArchiveClient({
      initialMode: "photo",
      initialView: "all",
      allMedia: media,
    });

    await waitFor(() => {
      expect(thumbRequests).toHaveLength(1);
    });
    expect(thumbRequests[0]).toHaveLength(18);

    const expectedRequestCounts = [2, 3, 4, 5, 7];
    for (const expectedCount of expectedRequestCounts) {
      const showMoreButton = view.container.querySelector(".archive-sticky-footer button") as HTMLButtonElement | null;
      expect(showMoreButton).not.toBeNull();
      fireEvent.click(showMoreButton as HTMLButtonElement);
      await waitFor(() => {
        expect(thumbRequests).toHaveLength(expectedCount);
      });
    }

    expect(thumbRequests.map((request) => request.length)).toEqual([18, 36, 54, 72, 90, 100, 1]);
    await waitFor(() => {
      const firstTileImage = view.container.querySelector('[data-archive-thumb-media-id="media-photo-001"] .archive-tile-image');
      expect(firstTileImage).not.toBeNull();
      expect(firstTileImage).toHaveAttribute("src", "https://example.com/thumbs/media-photo-001.webp");
    });
    const failedTile = view.container.querySelector('[data-archive-thumb-media-id="media-photo-101"]') as HTMLElement | null;
    expect(failedTile).not.toBeNull();
    expect(failedTile?.querySelector(".archive-tile-image")).toBeNull();
    expect(failedTile?.querySelector(".archive-tile-placeholder")).not.toBeNull();

    retrySucceeded = true;

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Открыть фото: Фото 1" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));

    for (let step = 0; step < 5; step += 1) {
      const showMoreButton = view.container.querySelector(".archive-sticky-footer button") as HTMLButtonElement | null;
      expect(showMoreButton).not.toBeNull();
      fireEvent.click(showMoreButton as HTMLButtonElement);
    }

    await waitFor(() => {
      expect(thumbRequests.some((request) => request.length === 1 && request[0] === "media-photo-101")).toBe(true);
    });

    await waitFor(() => {
      const recoveredTileImage = view.container.querySelector('[data-archive-thumb-media-id="media-photo-101"] .archive-tile-image');
      expect(recoveredTileImage).not.toBeNull();
      expect(recoveredTileImage).toHaveAttribute("src", "https://example.com/thumbs/media-photo-101.webp");
    });
  }, 15000);

  it("prefetches only the next visible-set thumbs during idle after the current screen resolves", async () => {
    const media = Array.from({ length: 36 }, (_, index) =>
      createMediaAsset({
        id: `media-photo-${index + 1}`,
        title: `Фото ${index + 1}`,
        storage_path: `trees/tree-1/media/photo/media-photo-${index + 1}/photo.jpg`,
      })
    );
    const requests: Array<{ mediaIds: string[] }> = [];

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/api/media/thumbs") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body || "{}"));
        requests.push({ mediaIds: payload.mediaIds });
        const urlsByMediaId = Object.fromEntries(
          payload.mediaIds.map((mediaId: string) => [mediaId, `https://example.com/${mediaId}.webp`])
        );
        return Response.json({ urlsByMediaId });
      }

      return Response.json({}, { status: 200 });
    });

    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      return window.setTimeout(() => {
        callback({
          didTimeout: false,
          timeRemaining: () => 50,
        } as IdleDeadline);
      }, 0);
    });
    const cancelIdleCallback = vi.fn((handle: number) => {
      window.clearTimeout(handle);
    });
    vi.stubGlobal("requestIdleCallback", requestIdleCallback);
    vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);

    renderArchiveClient({
      initialMode: "photo",
      initialView: "all",
      allMedia: media,
    });

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(requests[0]?.mediaIds).toHaveLength(18);

    await waitFor(() => {
      expect(requests).toHaveLength(2);
    });
    expect(requests[1]?.mediaIds).toHaveLength(18);
    expect(requests[1]?.mediaIds).toEqual(media.slice(18, 36).map((asset) => asset.id));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toHaveLength(2);
  });

  it("loads newly visible archive items after show more without extra interaction when next-page prefetch fails", async () => {
    const media = Array.from({ length: 36 }, (_, index) =>
      createMediaAsset({
        id: `media-photo-${index + 1}`,
        title: `Фото ${index + 1}`,
        storage_path: `trees/tree-1/media/photo/media-photo-${index + 1}/photo.jpg`,
      })
    );
    const requests: Array<string[]> = [];
    let scheduledIdleCallback: IdleRequestCallback | null = null;
    let resolvePrefetchRequest: ((response: Response) => void) | undefined;

    vi.stubGlobal("requestIdleCallback", vi.fn((callback: IdleRequestCallback) => {
      scheduledIdleCallback = callback;
      return 1;
    }));
    vi.stubGlobal("cancelIdleCallback", vi.fn());

    vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/api/media/thumbs") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body || "{}"));
        const mediaIds = payload.mediaIds as string[];
        requests.push(mediaIds);

        const urlsByMediaId = Object.fromEntries(
          mediaIds.map((mediaId) => [mediaId, `https://example.com/thumbs/${mediaId}.webp`])
        );

        if (requests.length === 1) {
          return Promise.resolve(Response.json({ urlsByMediaId }));
        }

        if (requests.length === 2) {
          return new Promise<Response>((resolve) => {
            resolvePrefetchRequest = resolve;
          });
        }

        return Promise.resolve(Response.json({ urlsByMediaId }));
      }

      return Promise.resolve(Response.json({}, { status: 200 }));
    });

    const view = renderArchiveClient({
      initialMode: "photo",
      initialView: "all",
      allMedia: media,
    });

    await waitFor(() => {
      const firstVisibleImage = view.container.querySelector('[data-archive-thumb-media-id="media-photo-1"] .archive-tile-image');
      expect(firstVisibleImage).not.toBeNull();
      expect(firstVisibleImage).toHaveAttribute("src", "https://example.com/thumbs/media-photo-1.webp");
    });

    await waitFor(() => {
      expect(scheduledIdleCallback).not.toBeNull();
    });
    await act(async () => {
      scheduledIdleCallback?.({
        didTimeout: false,
        timeRemaining: () => 50,
      } as IdleDeadline);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(requests).toHaveLength(2);
    });
    expect(requests[1]).toEqual(media.slice(18, 36).map((asset) => asset.id));
    expect(resolvePrefetchRequest).toBeDefined();

    fireEvent.click(screen.getAllByRole("button", { name: "Показать еще" })[0]);

    const newlyVisiblePlaceholder = view.container.querySelector('[data-archive-thumb-media-id="media-photo-19"] .archive-tile-placeholder');
    expect(newlyVisiblePlaceholder).not.toBeNull();

    await act(async () => {
      resolvePrefetchRequest!(Response.json({ error: "prefetch failed" }, { status: 500 }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(requests).toHaveLength(3);
    });
    expect(requests[2]).toEqual(media.slice(18, 36).map((asset) => asset.id));

    await waitFor(() => {
      const newlyVisibleImage = view.container.querySelector('[data-archive-thumb-media-id="media-photo-19"] .archive-tile-image');
      expect(newlyVisibleImage).not.toBeNull();
      expect(newlyVisibleImage).toHaveAttribute("src", "https://example.com/thumbs/media-photo-19.webp");
    });
  }, 15000);

  it("uses preview variants for fresh archive tiles, album covers, and fullscreen photo view", async () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Архивное фото",
      created_at: "2026-03-09T00:00:00.000Z",
      storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
    });

    renderArchiveClient({
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
      allMedia: [photo],
      initialThumbUrlsByMediaId: {
        "media-photo": "/api/media/media-photo?variant=thumb",
      },
    });

    const tileImage = document.querySelector(".archive-tile-image");
    expect(tileImage).not.toBeNull();
    expect(tileImage).toHaveAttribute("src", "/api/media/media-photo?variant=thumb");

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    const albumImage = document.querySelector(".archive-album-image");
    expect(albumImage).not.toBeNull();
    expect(albumImage).toHaveAttribute("src", "/api/media/media-photo?variant=thumb");
    expect(document.querySelector(".archive-album-cover-layout")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Свадьба.*Пользовательский альбом/ }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть фото: Архивное фото" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное фото" });
    expect(within(dialog).getByRole("img", { name: "Архивное фото" })).toHaveAttribute("src", "/api/media/media-photo?variant=medium");
  });

  it("shows a photo-only count label on album cards without the generic materials wording", () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Архивное фото",
      storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
    });

    renderArchiveClient({
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
      allMedia: [photo],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));

    const albumButton = screen.getByRole("button", { name: /Свадьба.*1 фото.*Пользовательский альбом/ });
    expect(albumButton).toBeInTheDocument();
    expect(albumButton).not.toHaveTextContent(/материал/i);
    const albumShell = albumButton.closest(".archive-album-card-shell");
    expect(albumShell?.querySelector(".archive-album-video-indicator")).toBeNull();
  });

  it("renders two previewable album items as a clean split cover", () => {
    const photoOne = createMediaAsset({
      id: "media-photo-1",
      title: "Первое фото",
      storage_path: "trees/tree-1/media/photo/media-photo-1/archive-photo-1.jpg",
    });
    const photoTwo = createMediaAsset({
      id: "media-photo-2",
      title: "Второе фото",
      storage_path: "trees/tree-1/media/photo/media-photo-2/archive-photo-2.jpg",
    });

    renderArchiveClient({
      allAlbums: [
        {
          id: "album-2-up",
          title: "Летняя поездка",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 2,
          coverMediaId: "media-photo-1",
        },
      ],
      persistedAlbumMediaMap: {
        "album-2-up": [photoOne, photoTwo],
      },
      allMedia: [photoOne, photoTwo],
      initialThumbUrlsByMediaId: {
        "media-photo-1": "/api/media/media-photo-1?variant=thumb",
        "media-photo-2": "/api/media/media-photo-2?variant=thumb",
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));

    const albumButton = screen.getByRole("button", { name: /Летняя поездка.*Пользовательский альбом/ });
    const albumShell = albumButton.closest(".archive-album-card-shell");
    expect(albumShell).not.toBeNull();
    expect(albumShell?.querySelector(".archive-album-cover-layout-two")).not.toBeNull();
    expect(albumShell?.querySelectorAll(".archive-album-preview-tile")).toHaveLength(2);

    const previewImages = albumShell?.querySelectorAll(".archive-album-preview-media");
    expect(previewImages).toHaveLength(2);
    expect(previewImages?.[0]).toHaveAttribute("src", "/api/media/media-photo-1?variant=thumb");
    expect(previewImages?.[1]).toHaveAttribute("src", "/api/media/media-photo-2?variant=thumb");
  });

  it("renders three or more previewable album items as a dominant preview with a stacked side rail", () => {
    const photoOne = createMediaAsset({
      id: "media-photo-1",
      title: "Первое фото",
      storage_path: "trees/tree-1/media/photo/media-photo-1/archive-photo-1.jpg",
    });
    const photoTwo = createMediaAsset({
      id: "media-photo-2",
      title: "Второе фото",
      storage_path: "trees/tree-1/media/photo/media-photo-2/archive-photo-2.jpg",
    });
    const photoThree = createMediaAsset({
      id: "media-photo-3",
      title: "Третье фото",
      storage_path: "trees/tree-1/media/photo/media-photo-3/archive-photo-3.jpg",
    });
    const photoFour = createMediaAsset({
      id: "media-photo-4",
      title: "Четвертое фото",
      storage_path: "trees/tree-1/media/photo/media-photo-4/archive-photo-4.jpg",
    });

    renderArchiveClient({
      allAlbums: [
        {
          id: "album-3-up",
          title: "Большой семейный альбом",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 4,
          coverMediaId: "media-photo-1",
        },
      ],
      persistedAlbumMediaMap: {
        "album-3-up": [photoOne, photoTwo, photoThree, photoFour],
      },
      allMedia: [photoOne, photoTwo, photoThree, photoFour],
      initialThumbUrlsByMediaId: {
        "media-photo-1": "/api/media/media-photo-1?variant=thumb",
        "media-photo-2": "/api/media/media-photo-2?variant=thumb",
        "media-photo-3": "/api/media/media-photo-3?variant=thumb",
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));

    const albumButton = screen.getByRole("button", { name: /Большой семейный альбом.*Пользовательский альбом/ });
    const albumShell = albumButton.closest(".archive-album-card-shell");
    expect(albumShell).not.toBeNull();
    expect(albumShell?.querySelector(".archive-album-cover-layout-three")).not.toBeNull();
    expect(albumShell?.querySelector(".archive-album-preview-tile-primary")).not.toBeNull();
    expect(albumShell?.querySelector(".archive-album-preview-column")).not.toBeNull();
    expect(albumShell?.querySelectorAll(".archive-album-preview-tile")).toHaveLength(3);

    const previewImages = albumShell?.querySelectorAll(".archive-album-preview-media");
    expect(previewImages).toHaveLength(3);
    expect(previewImages?.[0]).toHaveAttribute("src", "/api/media/media-photo-1?variant=thumb");
    expect(previewImages?.[1]).toHaveAttribute("src", "/api/media/media-photo-2?variant=thumb");
    expect(previewImages?.[2]).toHaveAttribute("src", "/api/media/media-photo-3?variant=thumb");
  });

  it("uses generated thumbs for ready cloudflare video tiles and video album covers", async () => {
    const video = createMediaAsset({
      id: "media-video",
      kind: "video",
      provider: "cloudflare_r2",
      preview_status: "ready",
      title: "Архивное видео",
      mime_type: "video/mp4",
      storage_path: "trees/tree-1/media/video/media-video/archive-video.mp4",
    });

    renderArchiveClient({
      initialMode: "video",
      allAlbums: [
        {
          id: "album-video",
          title: "Видеоархив",
          description: null,
          kind: "video",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-video",
        },
      ],
      persistedAlbumMediaMap: {
        "album-video": [video],
      },
      allMedia: [video],
      initialThumbUrlsByMediaId: {
        "media-video": "/api/media/media-video?variant=thumb",
      },
    });

    const tileImage = document.querySelector(".archive-tile-image");
    expect(tileImage).not.toBeNull();
    expect(tileImage).toHaveAttribute("src", "/api/media/media-video?variant=thumb");

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    const albumImage = document.querySelector(".archive-album-image");
    expect(albumImage).not.toBeNull();
    expect(albumImage).toHaveAttribute("src", "/api/media/media-video?variant=thumb");
    const albumCard = document.querySelector(".archive-album-card");
    expect(albumCard).not.toBeNull();
    const albumCardElement = albumCard as HTMLElement;
    expect(albumCardElement.querySelector(".archive-album-video-indicator")).not.toBeNull();
    expect(albumCardElement.querySelector(".archive-album-video-play-overlay")).toBeNull();
    expect(albumCardElement.querySelector(".archive-album-video-badge")).toBeNull();
    expect(albumCardElement.querySelector(".archive-album-cover .media-thumb-play")).toBeNull();
  });

  it("uses a video-specific empty cover for empty video albums", () => {
    renderArchiveClient({
      initialMode: "video",
      allAlbums: [
        {
          id: "album-video-empty",
          title: "Пустой видеоархив",
          description: null,
          kind: "video",
          albumKind: "manual",
          uploaderUserId: null,
          count: 0,
          coverMediaId: null,
        },
      ],
      persistedAlbumMediaMap: {
        "album-video-empty": [],
      },
      allMedia: [],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));

    const albumCard = document.querySelector(".archive-album-card") as HTMLElement | null;
    expect(albumCard).not.toBeNull();
    expect(albumCard?.querySelector(".archive-album-empty-placeholder-video")).not.toBeNull();
    expect(albumCard?.querySelector(".archive-album-video-indicator")).not.toBeNull();
    expect(albumCard?.querySelector(".archive-album-video-play-overlay")).toBeNull();
    expect(albumCard?.querySelector(".archive-album-video-badge")).toBeNull();
  });

  it("shows a video-only count label on album cards without the generic materials wording", () => {
    const video = createMediaAsset({
      id: "media-video",
      kind: "video",
      title: "Архивное видео",
      mime_type: "video/mp4",
      storage_path: "trees/tree-1/media/video/media-video/archive-video.mp4",
    });

    renderArchiveClient({
      initialMode: "video",
      allAlbums: [
        {
          id: "album-video",
          title: "Видеоархив",
          description: null,
          kind: "video",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-video",
        },
      ],
      persistedAlbumMediaMap: {
        "album-video": [video],
      },
      allMedia: [video],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));

    const albumButton = screen.getByRole("button", { name: /Видеоархив.*1 видео.*Пользовательский альбом/ });
    expect(albumButton).toBeInTheDocument();
    expect(albumButton).not.toHaveTextContent(/материал/i);
  });

  it("updates a visible pending cloudflare video tile to its generated preview without a manual reload", async () => {
    let summaryCalls = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url.includes("/api/media/media-video-pending?summary=1")) {
        summaryCalls += 1;
        return Response.json(
          {
            media: createMediaAsset({
              id: "media-video-pending",
              kind: "video",
              provider: "cloudflare_r2",
              preview_status: summaryCalls >= 1 ? "ready" : "pending",
              title: "Архивное видео pending",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/media-video-pending/archive-video.mp4",
            }),
          },
          { status: 200 }
        );
      }

      if (url.includes("/api/media/thumbs") && init?.method === "POST") {
        return Response.json(
          {
            urlsByMediaId: {
              "media-video-pending": "/api/media/media-video-pending?variant=thumb",
            },
          },
          { status: 200 }
        );
      }

      if (url.includes("/api/media/thumbs") && init?.method === "POST") {
        return Response.json(
          {
            urlsByMediaId: {
              "archive-video-pending-1": "/api/media/archive-video-pending-1?variant=thumb",
            },
          },
          { status: 200 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    renderArchiveClient({
      initialMode: "video",
      initialView: "all",
      allMedia: [
        createMediaAsset({
          id: "media-video-pending",
          kind: "video",
          provider: "cloudflare_r2",
          preview_status: "pending",
          title: "Архивное видео pending",
          mime_type: "video/mp4",
          storage_path: "trees/tree-1/media/video/media-video-pending/archive-video.mp4",
        }),
      ],
    });

    expect(document.querySelector(".archive-tile-placeholder-video")).not.toBeNull();

    await waitFor(() => {
      const tileImage = document.querySelector(".archive-tile-image");
      expect(tileImage).not.toBeNull();
      expect(tileImage).toHaveAttribute("src", "/api/media/media-video-pending?variant=thumb");
    }, { timeout: 5000 });
  }, 10000);

  it("cleans up pending visible video preview polling on unmount", () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => Response.json({}, { status: 200 }));

    const view = renderArchiveClient({
      initialMode: "video",
      initialView: "all",
      allMedia: [
        createMediaAsset({
          id: "media-video-pending",
          kind: "video",
          provider: "cloudflare_r2",
          preview_status: "pending",
          title: "Архивное видео pending",
          mime_type: "video/mp4",
          storage_path: "trees/tree-1/media/video/media-video-pending/archive-video.mp4",
        }),
      ],
    });

    expect(vi.getTimerCount()).toBeGreaterThan(0);

    view.unmount();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(vi.getTimerCount()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the second optimistic video preview polling and blob url alive when the first video becomes ready", async () => {
    vi.useFakeTimers();

    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementationOnce(() => "blob:video-1")
      .mockImplementationOnce(() => "blob:video-2");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    let uploadIntentCount = 0;
    const summaryCalls = {
      "archive-upload-video-1": 0,
      "archive-upload-video-2": 0,
    };

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

      if (url.includes("/api/media/archive/upload-intent")) {
        uploadIntentCount += 1;
        const mediaId = `archive-upload-video-${uploadIntentCount}`;
        return Response.json(
          {
            mediaId,
            kind: "video",
            path: `trees/tree-1/media/video/${mediaId}/archive-video-${uploadIntentCount}.mp4`,
            bucket: "bucket-1",
            signedUrl: `https://example.com/${mediaId}`,
            token: null,
            uploadProvider: "cloudflare_r2",
            configuredBackend: "cloudflare_r2",
            resolvedUploadBackend: "cloudflare_r2",
            rolloutState: "cloudflare_rollout_active",
            forceProxyUpload: true,
            uploadMode: "proxy",
            variantUploadMode: "server_proxy",
            variantTargets: [],
          },
          { status: 201 }
        );
      }

      if (url.includes("/api/media/archive/complete")) {
        const mediaId = typeof body?.mediaId === "string" ? body.mediaId : "archive-upload-video-unknown";
        const fileName = typeof body?.title === "string" ? body.title : `${mediaId}.mp4`;
        return Response.json(
          {
            message: "Материал сохранен в семейный архив.",
            uploaderAlbumId: null,
            media: createMediaAsset({
              id: mediaId,
              kind: "video",
              provider: "cloudflare_r2",
              preview_status: "pending",
              title: fileName,
              mime_type: "video/mp4",
              storage_path: `trees/tree-1/media/video/${mediaId}/${fileName}`,
            }),
          },
          { status: 201 }
        );
      }

      if (url.includes("/api/media/archive-upload-video-1?summary=1")) {
        summaryCalls["archive-upload-video-1"] += 1;
        return Response.json(
          {
            media: createMediaAsset({
              id: "archive-upload-video-1",
              kind: "video",
              provider: "cloudflare_r2",
              preview_status: "ready",
              title: "first-video.mp4",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/archive-upload-video-1/first-video.mp4",
            }),
          },
          { status: 200 }
        );
      }

      if (url.includes("/api/media/archive-upload-video-2?summary=1")) {
        summaryCalls["archive-upload-video-2"] += 1;
        return Response.json(
          {
            media: createMediaAsset({
              id: "archive-upload-video-2",
              kind: "video",
              provider: "cloudflare_r2",
              preview_status: "pending",
              title: "second-video.mp4",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/archive-upload-video-2/second-video.mp4",
            }),
          },
          { status: 200 }
        );
      }

      if (url.includes("/api/media/thumbs") && init?.method === "POST") {
        return Response.json(
          {
            urlsByMediaId: {
              "archive-upload-video-1": "/api/media/archive-upload-video-1?variant=thumb",
            },
          },
          { status: 200 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    const view = renderArchiveClient({
      initialMode: "video",
      initialView: "all",
      allMedia: [],
    });

    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const firstFile = new File([new Uint8Array([1, 2, 3])], "first-video.mp4", { type: "video/mp4" });
    const secondFile = new File([new Uint8Array([4, 5, 6])], "second-video.mp4", { type: "video/mp4" });

    Object.defineProperty(input, "files", {
      configurable: true,
      value: [firstFile, secondFile],
    });

    fireEvent.change(input);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить 2" }));

    await act(async () => {
      for (let index = 0; index < 20; index += 1) {
        await Promise.resolve();
      }
    });

    expect(createObjectURLSpy).toHaveBeenCalledTimes(2);

    const getSecondPreviewTile = () =>
      view.container.querySelector('[data-archive-thumb-media-id="archive-upload-video-2"] video.archive-tile-video') as HTMLVideoElement | null;

    expect(getSecondPreviewTile()).not.toBeNull();
    expect(getSecondPreviewTile()).toHaveAttribute("src", "blob:video-2");

    await act(async () => {
      vi.advanceTimersByTime(2000);
      for (let index = 0; index < 20; index += 1) {
        await Promise.resolve();
      }
    });

    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:video-1");
    expect(revokeObjectURLSpy).not.toHaveBeenCalledWith("blob:video-2");
    expect(summaryCalls["archive-upload-video-2"]).toBe(1);
    expect(getSecondPreviewTile()).not.toBeNull();
    expect(getSecondPreviewTile()).toHaveAttribute("src", "blob:video-2");

    await act(async () => {
      vi.advanceTimersByTime(2000);
      for (let index = 0; index < 20; index += 1) {
        await Promise.resolve();
      }
    });

    expect(summaryCalls["archive-upload-video-2"]).toBe(2);
    expect(getSecondPreviewTile()).not.toBeNull();
    expect(getSecondPreviewTile()).toHaveAttribute("src", "blob:video-2");

    view.unmount();

    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });
  });

  it("aborts in-flight archive thumb batch requests on unmount", async () => {
    let capturedSignal: AbortSignal | null = null;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/api/media/thumbs")) {
        capturedSignal = init?.signal as AbortSignal | null;
        return new Promise<Response>(() => undefined);
      }

      return Promise.resolve(Response.json({}, { status: 200 }));
    });

    const view = renderArchiveClient({
      allMedia: [
        createMediaAsset({
          id: "media-photo",
          title: "Архивное фото",
          storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
        }),
      ],
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/media/thumbs",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    view.unmount();

    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("keeps only the top archive action group by default", () => {
    renderArchiveClient();

    expect(screen.getAllByRole("button", { name: "Загрузить файлы" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Создать альбом" })).toHaveLength(1);
    expect(screen.queryByText("3 материалов в текущем режиме")).not.toBeInTheDocument();
  });

  it("keeps the archive grid visual-first while preserving album descriptions", () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Семейный портрет",
      caption: "Главная фотография архива",
      storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
    });

    renderArchiveClient({
      allMedia: [photo],
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: "Большая семейная подборка со свадьбы",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
    });

    expect(screen.queryByText("Семейный портрет")).not.toBeInTheDocument();
    expect(screen.queryByText("Главная фотография архива")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    expect(screen.getByText("Большая семейная подборка со свадьбы")).toBeInTheDocument();
  });

  it("does not use photo album covers in video albums view", () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Семейный портрет",
      storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
    });

    const view = renderArchiveClient({
      allMedia: [photo],
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: "Большая семейная подборка",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));
    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));

    const albumGrid = view.container.querySelector(".archive-album-grid");
    expect(albumGrid).toBeNull();
    expect(screen.queryByRole("button", { name: /Свадьба.*Пользовательский альбом/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Загрузить видео" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Создать альбом" })).toHaveLength(2);
  });

  it("shows a management trigger for manual album cards without changing the main card structure", () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Семейный портрет",
      storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
    });

    const view = renderArchiveClient({
      allMedia: [photo],
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: "Старая подпись",
          access: "members",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));

    expect(screen.getByRole("button", { name: "Открыть действия для альбома «Свадьба»" })).toBeInTheDocument();

    const shell = view.container.querySelector(".archive-album-card-shell");
    expect(shell).not.toBeNull();
    expect(shell?.querySelectorAll(".archive-album-card")).toHaveLength(1);
    expect(shell?.querySelectorAll(".archive-album-cover")).toHaveLength(1);
    expect(shell?.querySelectorAll(".archive-album-copy")).toHaveLength(1);
    expect(shell?.querySelectorAll(".archive-album-actions-trigger")).toHaveLength(1);
    expect(shell?.querySelector(".archive-album-cover .archive-album-actions-trigger")).not.toBeNull();
    expect(shell?.querySelector(".archive-album-access-indicator")).not.toBeNull();
  });

  it("shows the same management trigger for uploader albums with enabled edit/delete actions", async () => {
    renderArchiveClient({
      allMedia: [
        createMediaAsset({
          id: "media-photo",
          title: "Семейный портрет",
          storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
          created_by: "user-1",
        }),
      ],
      uploaderLabels: [{ userId: "user-1", label: "От Вячеслава" }],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));

    expect(screen.getByText("От Вячеслава")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для альбома «От Вячеслава»" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Редактировать" })).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: "Удалить" })).toBeEnabled();
    expect(screen.queryByText("Автоальбом создается автоматически и пока не редактируется.")).not.toBeInTheDocument();
  });

  it("keeps uploader album card count aligned with uploader album detail contents even when persisted links are partial", async () => {
    const firstPhoto = createMediaAsset({
      id: "media-photo-1",
      title: "Первое фото",
      storage_path: "trees/tree-1/media/photo/media-photo-1/archive-photo.jpg",
      created_by: "user-1",
    });
    const secondPhoto = createMediaAsset({
      id: "media-photo-2",
      title: "Второе фото",
      storage_path: "trees/tree-1/media/photo/media-photo-2/archive-photo.jpg",
      created_by: "user-1",
    });
    const thirdPhoto = createMediaAsset({
      id: "media-photo-3",
      title: "Третье фото",
      storage_path: "trees/tree-1/media/photo/media-photo-3/archive-photo.jpg",
      created_by: "user-1",
    });

    renderArchiveClient({
      allMedia: [firstPhoto, secondPhoto, thirdPhoto],
      allAlbums: [
        {
          id: "album-uploader-photo",
          title: "От Вячеслава",
          description: null,
          kind: "photo",
          access: "members",
          albumKind: "uploader",
          uploaderUserId: "user-1",
          count: 1,
          coverMediaId: "media-photo-1",
        },
      ],
      persistedAlbumMediaMap: {
        "album-uploader-photo": [firstPhoto],
      },
      uploaderLabels: [{ userId: "user-1", label: "От Вячеслава" }],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));

    expect(screen.getByRole("button", { name: /От Вячеслава.*3 фото/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /От Вячеслава.*3 фото/ }));

    expect(screen.getAllByText("От Вячеслава").length).toBeGreaterThan(0);
    expect(screen.getByText("3 фото")).toBeInTheDocument();

    const grid = document.querySelector(".archive-grid.archive-grid-album");
    expect(grid).not.toBeNull();
    expect(within(grid as HTMLElement).getByRole("button", { name: "Открыть фото: Первое фото" })).toBeInTheDocument();
    expect(within(grid as HTMLElement).getByRole("button", { name: "Открыть фото: Второе фото" })).toBeInTheDocument();
    expect(within(grid as HTMLElement).getByRole("button", { name: "Открыть фото: Третье фото" })).toBeInTheDocument();
  });

  it("merges uploader albums by uploader in all media mode", async () => {
    const photoOne = createMediaAsset({
      id: "media-photo-1",
      title: "Фото 1",
      kind: "photo",
      storage_path: "trees/tree-1/media/photo/media-photo-1/archive-photo.jpg",
      created_by: "user-1",
    });
    const photoTwo = createMediaAsset({
      id: "media-photo-2",
      title: "Фото 2",
      kind: "photo",
      storage_path: "trees/tree-1/media/photo/media-photo-2/archive-photo.jpg",
      created_by: "user-1",
    });
    const videoOne = createMediaAsset({
      id: "media-video-1",
      kind: "video",
      title: "Видео 1",
      mime_type: "video/mp4",
      storage_path: "trees/tree-1/media/video/media-video-1/archive-video.mp4",
      created_by: "user-1",
    });

    renderArchiveClient({
      initialMode: "all",
      initialView: "albums",
      allMedia: [photoOne, photoTwo, videoOne],
      allAlbums: [
        {
          id: "album-uploader-photo",
          title: "От Вячеслава",
          description: null,
          kind: "photo",
          access: "members",
          albumKind: "uploader",
          uploaderUserId: "user-1",
          count: 2,
          coverMediaId: "media-photo-1",
        },
        {
          id: "album-uploader-video",
          title: "От Вячеслава",
          description: null,
          kind: "video",
          access: "members",
          albumKind: "uploader",
          uploaderUserId: "user-1",
          count: 1,
          coverMediaId: "media-video-1",
        },
      ],
      persistedAlbumMediaMap: {
        "album-uploader-photo": [photoOne, photoTwo],
        "album-uploader-video": [videoOne],
      },
      uploaderLabels: [{ userId: "user-1", label: "От Вячеслава" }],
    });

    const uploaderAlbumButtons = screen.getAllByRole("button", { name: /От Вячеслава.*Автоальбом загрузившего/ });
    expect(uploaderAlbumButtons).toHaveLength(1);
    expect(uploaderAlbumButtons[0]).toHaveTextContent("2 фото · 1 видео");
    const uploaderAlbumShell = uploaderAlbumButtons[0].closest(".archive-album-card-shell");
    expect(uploaderAlbumShell?.querySelector(".archive-album-video-indicator")).not.toBeNull();
    expect(uploaderAlbumShell?.querySelector(".archive-album-video-play-overlay")).toBeNull();
    expect(uploaderAlbumShell?.querySelector(".archive-album-video-badge")).toBeNull();

    fireEvent.click(uploaderAlbumButtons[0]);

    expect(screen.getAllByText("От Вячеслава").length).toBeGreaterThan(0);

    const grid = document.querySelector(".archive-grid.archive-grid-album");
    expect(grid).not.toBeNull();
    expect(within(grid as HTMLElement).getByRole("button", { name: "Открыть фото: Фото 1" })).toBeInTheDocument();
    expect(within(grid as HTMLElement).getByRole("button", { name: "Открыть фото: Фото 2" })).toBeInTheDocument();
    expect(within(grid as HTMLElement).getByRole("button", { name: "Открыть видео: Видео 1" })).toBeInTheDocument();
  });

  it("opens an edit dialog from the album card menu and updates the manual album", async () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Семейный портрет",
      storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
    });

    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url, method: init?.method, body });

      if (url.endsWith("/api/media/albums/album-1") && init?.method === "PATCH") {
        return Response.json(
          {
            album: {
              id: "album-1",
              tree_id: "tree-1",
              title: "Поездка",
              description: "Новая семейная подпись",
              kind: "photo",
              access: "members",
              album_kind: "manual",
              uploader_user_id: null,
              created_by: "user-1",
              created_at: "2026-03-27T00:00:00.000Z",
              updated_at: "2026-03-27T00:00:00.000Z",
            },
            message: "Альбом обновлен.",
          },
          { status: 200 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    renderArchiveClient({
      allMedia: [photo],
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: "Старая подпись",
          access: "members",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для альбома «Свадьба»" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Редактировать" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));

    const dialog = await screen.findByRole("dialog", { name: "Редактировать альбом" });
    expect(document.querySelector(".archive-album-grid")).not.toBeNull();
    expect(document.querySelector(".archive-grid")).toBeNull();
    expect(within(dialog).getByLabelText("Название")).toHaveValue("Свадьба");
    expect(within(dialog).getByLabelText("Описание")).toHaveValue("Старая подпись");
    expect(within(dialog).getByLabelText("Доступ")).toHaveTextContent("Только для семьи");
    expect(within(dialog).getByText("Виден всем участникам семейного дерева")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Поездка" } });
    fireEvent.change(within(dialog).getByLabelText("Описание"), { target: { value: "Новая семейная подпись" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(requests.some((request) => request.url.endsWith("/api/media/albums/album-1") && request.method === "PATCH")).toBe(true);
    });

    const patchRequest = requests.find((request) => request.url.endsWith("/api/media/albums/album-1") && request.method === "PATCH");
    expect(patchRequest?.body).toMatchObject({
      title: "Поездка",
      description: "Новая семейная подпись",
    });

    await waitFor(() => {
      expect(screen.getByText("Поездка")).toBeInTheDocument();
    });
    expect(document.querySelector(".archive-album-grid")).not.toBeNull();
    expect(document.querySelector(".archive-grid")).toBeNull();
    expect(screen.queryByText("Свадьба")).not.toBeInTheDocument();
    expect(screen.queryByText("Старая подпись")).not.toBeInTheDocument();
  });

  it("opens a delete dialog from the album card menu and removes only the album card", async () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Семейный портрет",
      storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
    });

    const requests: Array<{ url: string; method?: string }> = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      requests.push({ url, method: init?.method });

      if (url.endsWith("/api/media/albums/album-1") && init?.method === "DELETE") {
        return Response.json({ message: "Альбом удален." }, { status: 200 });
      }

      return Response.json({}, { status: 200 });
    });

    renderArchiveClient({
      allMedia: [photo],
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: "Старая подпись",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для альбома «Свадьба»" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    const dialog = await screen.findByRole("dialog", { name: "Удалить альбом?" });
    expect(within(dialog).getByText(/Файлы и видео останутся в семейном архиве/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));

    await waitFor(() => {
      expect(requests.some((request) => request.url.endsWith("/api/media/albums/album-1") && request.method === "DELETE")).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Свадьба.*Старая подпись/ })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Все" }));
    expect(screen.getByRole("button", { name: "Открыть фото: Семейный портрет" })).toBeInTheDocument();
  });

  it("shows only download and album actions in the archive card menu for read-only viewers", async () => {
    renderArchiveClient({ canEdit: false });

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Архивное фото»" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Скачать" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Скачать" })).toHaveAttribute("href", "/api/media/media-photo?download=1");
    expect(screen.getByRole("link", { name: "Перейти к альбому" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Выбрать несколько" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить" })).not.toBeInTheDocument();
  });

  it("hides the album navigation item when the media does not belong to any album", async () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Одиночное фото",
      storage_path: "trees/tree-1/media/photo/media-photo/standalone.jpg",
      created_by: null,
    });

    renderArchiveClient({
      canEdit: false,
      allMedia: [photo],
      allAlbums: [],
      persistedAlbumMediaMap: {},
    });

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Одиночное фото»" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Скачать" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Перейти к альбому" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Перейти в альбом…" })).not.toBeInTheDocument();
  });

  it("renders a direct album link when the media belongs to exactly one album", async () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Фото из одного альбома",
      storage_path: "trees/tree-1/media/photo/media-photo/one-album.jpg",
      created_by: null,
    });

    renderArchiveClient({
      canEdit: false,
      allMedia: [photo],
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Фото из одного альбома»" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Перейти к альбому" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Перейти к альбому" })).toHaveAttribute("href", "/tree/demo-family/media?mode=photo&view=albums&album=album-1");
    expect(screen.queryByRole("button", { name: "Перейти в альбом…" })).not.toBeInTheDocument();
  });

  it("renders an in-place album chooser when the media belongs to multiple albums", async () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Фото из нескольких альбомов",
      storage_path: "trees/tree-1/media/photo/media-photo/multi-album.jpg",
      created_by: null,
    });

    renderArchiveClient({
      canEdit: false,
      allMedia: [photo],
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
        {
          id: "album-2",
          title: "Путешествие",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
        "album-2": [photo],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Фото из нескольких альбомов»" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Перейти в альбом…" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Перейти к альбому" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Перейти в альбом…" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Свадьба" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Свадьба" })).toHaveAttribute("href", "/tree/demo-family/media?mode=photo&view=albums&album=album-1");
    expect(screen.getByRole("link", { name: "Путешествие" })).toHaveAttribute("href", "/tree/demo-family/media?mode=photo&view=albums&album=album-2");
  });

  it("starts archive selection mode from the card menu and toggles cards instead of opening the viewer", async () => {
    renderArchiveClient();

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Архивное фото»" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Выбрать несколько" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько" }));

    expect(screen.getByRole("region", { name: "Действия с выбранными материалами" })).toBeInTheDocument();
    expect(screen.getByText("Выбрано: 1")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Выбрать медиа Архивное фото" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Открыть видео: Архивное видео" }));

    expect(screen.getByText("Выбрано: 2")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Просмотр архива: Архивное видео" })).not.toBeInTheDocument();
  });

  it("keeps video archive mode on the normal media grid without album management leakage", () => {
    const view = renderArchiveClient();

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));

    const grid = view.container.querySelector(".archive-grid");
    expect(grid).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Загрузить видео" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Создать альбом" })).toHaveLength(1);
    expect(screen.queryByText("2 видео в текущем режиме")).not.toBeInTheDocument();
    expect(grid?.querySelectorAll(".archive-tile-shell")).toHaveLength(2);
    expect(grid?.querySelectorAll(".archive-tile")).toHaveLength(2);
    expect(grid?.querySelectorAll(".archive-tile-actions-trigger")).toHaveLength(2);
    expect(grid?.querySelectorAll(".archive-album-actions-trigger")).toHaveLength(0);
  });

  it("clears archive selection mode on Escape when no archive overlay is open", async () => {
    renderArchiveClient();

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Архивное фото»" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Выбрать несколько" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько" }));

    expect(screen.getByRole("region", { name: "Действия с выбранными материалами" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Действия с выбранными материалами" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("checkbox", { name: "Выбрать медиа Архивное фото" })).not.toBeInTheDocument();
  });

  it("does not clear archive selection mode on Escape while an archive confirm dialog is open", async () => {
    renderArchiveClient();

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Архивное фото»" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Выбрать несколько" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Действия с выбранными материалами" })).getByRole("button", { name: "Удалить" }));

    expect(screen.getByRole("dialog", { name: "Удалить выбранные фото?" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("dialog", { name: "Удалить выбранные фото?" })).toBeInTheDocument();
  }, 10000);

  it("deletes a single archive media item from the card menu and updates the grid without reload", async () => {
    const requests: Array<{ url: string; method?: string }> = [];

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      requests.push({ url, method: init?.method });

      if (url.endsWith("/api/media/media-photo") && init?.method === "DELETE") {
        return Response.json({ message: "Медиа удалено." }, { status: 200 });
      }

      return Response.json({}, { status: 200 });
    });

    renderArchiveClient();

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Архивное фото»" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(screen.getByRole("dialog", { name: "Удалить это фото?" })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("dialog", { name: "Удалить это фото?" })).getByRole("button", { name: "Удалить" }));

    await waitFor(() => {
      expect(requests.some((request) => request.url.endsWith("/api/media/media-photo") && request.method === "DELETE")).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Открыть фото: Архивное фото" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Медиа удалено.")).toBeInTheDocument();
  });

  it("bulk deletes selected archive media from the archive page action bar", async () => {
    const requests: Array<{ url: string; method?: string }> = [];

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      requests.push({ url, method: init?.method });

      if (
        (url.endsWith("/api/media/media-photo") || url.endsWith("/api/media/media-video")) &&
        init?.method === "DELETE"
      ) {
        return Response.json({ message: "Медиа удалено." }, { status: 200 });
      }

      return Response.json({}, { status: 200 });
    });

    renderArchiveClient();

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Архивное фото»" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Выбрать несколько" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько" }));

    fireEvent.click(screen.getByRole("button", { name: "Открыть видео: Архивное видео" }));
    expect(screen.getByText("Выбрано: 2")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("region", { name: "Действия с выбранными материалами" })).getByRole("button", { name: "Удалить" }));
    expect(screen.getByRole("dialog", { name: "Удалить выбранные фото?" })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("dialog", { name: "Удалить выбранные фото?" })).getByRole("button", { name: "Удалить" }));

    await waitFor(() => {
      expect(requests.some((request) => request.url.endsWith("/api/media/media-photo") && request.method === "DELETE")).toBe(true);
      expect(requests.some((request) => request.url.endsWith("/api/media/media-video") && request.method === "DELETE")).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Открыть фото: Архивное фото" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Открыть видео: Архивное видео" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("region", { name: "Действия с выбранными материалами" })).not.toBeInTheDocument();
  });

  it("downloads selected archive media as zip from the selection bar", async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURLMock = vi.fn(() => "blob:archive-download");
    const revokeObjectURLMock = vi.fn();
    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);

    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url, method: init?.method, body });

      if (url.endsWith("/api/media/archive/download") && init?.method === "POST") {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="archive-media-test.zip"',
          },
        });
      }

      return Response.json({}, { status: 200 });
    });

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        Object.defineProperty(element, "click", {
          configurable: true,
          value: clickMock,
        });
      }
      return element;
    }) as typeof document.createElement);

    renderArchiveClient();

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Архивное фото»" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Выбрать несколько" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько" }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть видео: Архивное видео" }));

    fireEvent.click(within(screen.getByRole("region", { name: "Действия с выбранными материалами" })).getByRole("button", { name: "Скачать" }));

    await waitFor(() => {
      expect(requests.some((request) => request.url.endsWith("/api/media/archive/download") && request.method === "POST")).toBe(true);
    });

    const downloadRequest = requests.find((request) => request.url.endsWith("/api/media/archive/download") && request.method === "POST");
    expect(downloadRequest?.body).toMatchObject({
      treeId: "tree-1",
      mediaIds: ["media-photo", "media-video"],
    });
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:archive-download");

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("shows the bulk add-to-album action in archive selection mode and opens a manual album picker", async () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Архивное фото",
      storage_path: "trees/tree-1/media/photo/media-photo/archive-photo.jpg",
    });

    renderArchiveClient({
      allMedia: [photo],
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 0,
          coverMediaId: null,
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Архивное фото»" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Выбрать несколько" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько" }));

    expect(screen.getByRole("button", { name: "Добавить в альбом" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Добавить в альбом" }));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Альбом" })).toBeInTheDocument();
    });
    expect(screen.getByRole("combobox", { name: "Альбом" })).toHaveTextContent("Свадьба");
  });

  it("adds selected archive media to one manual album, skips duplicates, patches local album state, and clears selection", async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
    const firstPhoto = createMediaAsset({
      id: "media-photo-1",
      title: "Первое фото",
      storage_path: "trees/tree-1/media/photo/media-photo-1/archive-photo.jpg",
      created_by: null,
    });
    const secondPhoto = createMediaAsset({
      id: "media-photo-2",
      title: "Второе фото",
      storage_path: "trees/tree-1/media/photo/media-photo-2/archive-photo.jpg",
      created_by: null,
    });

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url, method: init?.method, body });

      if (url.endsWith("/api/media/albums/items") && init?.method === "POST") {
        return Response.json(
          {
            items: [
              {
                id: "album-item-2",
                album_id: "album-1",
                media_id: "media-photo-2",
                created_at: "2026-03-27T00:00:00.000Z",
              },
            ],
            createdCount: 1,
            message: "Материал добавлен в альбом.",
          },
          { status: 201 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    renderArchiveClient({
      allMedia: [firstPhoto, secondPhoto],
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo-1",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [firstPhoto],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Первое фото»" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Выбрать несколько" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько" }));

    fireEvent.click(screen.getByRole("button", { name: "Открыть фото: Второе фото" }));
    expect(screen.getByText("Выбрано: 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Добавить в альбом" }));
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Альбом" })).toBeInTheDocument();
    });
    const albumPopover = document.querySelector('[data-slot="popover-content"]') as HTMLElement | null;
    expect(albumPopover).not.toBeNull();
    expect(within(albumPopover as HTMLElement).getByRole("combobox", { name: "Альбом" })).toHaveTextContent("Свадьба");
    fireEvent.click(within(albumPopover as HTMLElement).getByRole("button", { name: "Добавить" }));

    await waitFor(() => {
      expect(requests.some((request) => request.url.endsWith("/api/media/albums/items") && request.method === "POST")).toBe(true);
    });

    const addRequest = requests.find((request) => request.url.endsWith("/api/media/albums/items") && request.method === "POST");
    expect(addRequest?.body).toMatchObject({
      treeId: "tree-1",
      albumId: "album-1",
      mediaIds: ["media-photo-2"],
    });

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Действия с выбранными материалами" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("checkbox", { name: "Выбрать медиа Первое фото" })).not.toBeInTheDocument();
    expect(screen.getByText("Материал добавлен в альбом.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    expect(screen.getByRole("button", { name: /Свадьба.*2 фото/ })).toBeInTheDocument();
  }, 10000);

  it("shows contextual empty-state actions when the current archive mode is empty", () => {
    renderArchiveClient({ allMedia: [] });

    const emptyState = screen.getByText("Семейный архив пока пуст").closest(".empty-state");
    expect(emptyState).not.toBeNull();
    expect(within(emptyState as HTMLElement).getByRole("button", { name: "Загрузить файлы" })).toBeInTheDocument();
    expect(within(emptyState as HTMLElement).getByRole("button", { name: "Создать альбом" })).toBeInTheDocument();
  });

  it("opens the archive viewer from the visible grid subset instead of the full mode collection", () => {
    const videos = Array.from({ length: 20 }, (_, index) =>
      createMediaAsset({
        id: `media-video-${index + 1}`,
        kind: "video",
        title: `Видео ${index + 1}`,
        mime_type: "video/mp4",
        storage_path: `trees/tree-1/media/video/media-video-${index + 1}/video-${index + 1}.mp4`,
      })
    );

    renderArchiveClient({
      initialMode: "video",
      initialView: "all",
      allMedia: videos,
      allAlbums: [],
      persistedAlbumMediaMap: {},
    });

    fireEvent.click(screen.getByRole("button", { name: "Открыть видео: Видео 1" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Видео 1" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelectorAll(".media-lightbox-strip-fixed .person-media-thumb")).toHaveLength(18);
    expect(within(dialog).queryByRole("button", { name: "Показать медиа 19: Видео 19" })).toBeNull();
  });

  it("keeps album detail viewer scoped to the current album media set", () => {
    const firstPhoto = createMediaAsset({
      id: "media-photo-1",
      title: "Фото 1",
      storage_path: "trees/tree-1/media/photo/media-photo-1/photo-1.jpg",
    });
    const secondPhoto = createMediaAsset({
      id: "media-photo-2",
      title: "Фото 2",
      storage_path: "trees/tree-1/media/photo/media-photo-2/photo-2.jpg",
    });
    const outsidePhoto = createMediaAsset({
      id: "media-photo-3",
      title: "Фото вне альбома",
      storage_path: "trees/tree-1/media/photo/media-photo-3/photo-3.jpg",
    });

    renderArchiveClient({
      initialMode: "photo",
      initialView: "albums",
      allMedia: [firstPhoto, secondPhoto, outsidePhoto],
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: null,
          kind: "photo",
          albumKind: "manual",
          uploaderUserId: null,
          count: 2,
          coverMediaId: "media-photo-1",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [firstPhoto, secondPhoto],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /Свадьба.*2 фото.*Пользовательский альбом/ }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть фото: Фото 1" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Фото 1" });
    expect(dialog.querySelectorAll(".media-lightbox-strip-fixed .person-media-thumb")).toHaveLength(2);
    expect(within(dialog).queryByRole("button", { name: "Показать медиа 3: Фото вне альбома" })).toBeNull();
  });

  it("narrows merged uploader album viewer scope to a bounded window around the clicked media", () => {
    const mixedMedia = Array.from({ length: 30 }, (_, index) =>
      createMediaAsset({
        id: `media-mixed-${index + 1}`,
        kind: index % 2 === 0 ? "video" : "photo",
        title: index % 2 === 0 ? `Видео ${index + 1}` : `Фото ${index + 1}`,
        mime_type: index % 2 === 0 ? "video/mp4" : "image/jpeg",
        storage_path:
          index % 2 === 0
            ? `trees/tree-1/media/video/media-mixed-${index + 1}/video-${index + 1}.mp4`
            : `trees/tree-1/media/photo/media-mixed-${index + 1}/photo-${index + 1}.jpg`,
        created_by: "user-1",
      })
    );

    renderArchiveClient({
      initialMode: "all",
      initialView: "albums",
      allMedia: mixedMedia,
      allAlbums: [
        {
          id: "album-uploader-all",
          title: "От Вячеслава",
          description: null,
          kind: "all",
          albumKind: "uploader",
          uploaderUserId: "user-1",
          count: 30,
          coverMediaId: "media-mixed-1",
        },
      ],
      persistedAlbumMediaMap: {
        "album-uploader-all": mixedMedia,
      },
      uploaderLabels: [{ userId: "user-1", label: "От Вячеслава" }],
    });

    fireEvent.click(screen.getByRole("button", { name: /От Вячеслава.*15 фото · 15 видео.*Автоальбом загрузившего/ }));
    fireEvent.click(screen.getByRole("button", { name: "Показать еще" }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть видео: Видео 21" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Видео 21" });
    expect(dialog.querySelectorAll(".media-lightbox-strip-fixed .person-media-thumb")).toHaveLength(18);
    expect(within(dialog).getByRole("button", { name: "Показать медиа 10: Видео 21" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Показать медиа 1: Видео 1" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Показать медиа 30: Фото 30" })).toBeNull();
  });

  it("opens album detail as a single header with a media grid", () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Фото из альбома",
      storage_path: "trees/tree-1/media/photo/media-photo/album-photo.jpg",
    });

    renderArchiveClient({
      allAlbums: [
        {
          id: "album-1",
          title: "Свадьба",
          description: null,
          kind: "photo",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
      allMedia: [photo],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    fireEvent.click(screen.getByRole("button", { name: /Свадьба.*Пользовательский альбом/ }));

    expect(screen.getAllByText("Свадьба")).toHaveLength(1);
    expect(screen.getByText("1 фото")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Загрузить/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Создать альбом" })).not.toBeInTheDocument();
    expect(screen.queryByText("1 фото в альбоме")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Свадьба.*Пользовательский альбом/ })).not.toBeInTheDocument();

    const grid = document.querySelector(".archive-grid");
    expect(grid).not.toBeNull();
    expect(grid).toHaveClass("archive-grid-album");
    expect(within(grid as HTMLElement).getByRole("button", { name: "Открыть фото: Фото из альбома" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Открыть фото: Фото из альбома" }));
    expect(screen.getByRole("dialog", { name: "Просмотр архива: Фото из альбома" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    expect(screen.getByRole("button", { name: /Свадьба.*Пользовательский альбом/ })).toBeInTheDocument();
  });

  it("keeps the album list stable after switching to albums view", async () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Фото из альбома",
      storage_path: "trees/tree-1/media/photo/media-photo/album-photo.jpg",
      created_by: null,
    });

    renderArchiveClient({
      allMedia: [photo],
        allAlbums: [
          {
            id: "album-1",
            title: "Свадьба",
            description: null,
            kind: "photo",
            albumKind: "manual",
            uploaderUserId: null,
            count: 1,
          coverMediaId: "media-photo",
        },
          {
            id: "album-2",
            title: "Путешествие",
            description: null,
            kind: "photo",
            albumKind: "manual",
            uploaderUserId: null,
            count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
        "album-2": [photo],
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Пользовательский альбом/ })).toHaveLength(2);
    });

    expect(document.querySelector(".archive-album-grid")).not.toBeNull();
    expect(document.querySelectorAll(".archive-album-card")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Открыть фото: Фото из альбома" })).not.toBeInTheDocument();
    expect(screen.queryByText("2 материалов")).not.toBeInTheDocument();
  });

  it("can start directly inside a selected album from the initial query state", () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Фото из альбома",
      storage_path: "trees/tree-1/media/photo/media-photo/album-photo.jpg",
      created_by: "user-1",
    });

    render(
      <TreeMediaArchiveClient
        treeId="tree-1"
        slug="demo-family"
        canEdit
        initialMode="photo"
        initialView="albums"
        initialAlbumId="uploader-user-1-photo"
        allMedia={[photo]}
        allAlbums={[]}
        persistedAlbumMediaMap={{}}
        initialThumbUrlsByMediaId={{
          "media-photo": "/api/media/media-photo?variant=thumb",
        }}
        uploaderLabels={[{ userId: "user-1", label: "От Вячеслава" }]}
      />
    );

    expect(screen.getAllByText("От Вячеслава").length).toBeGreaterThan(0);
    expect(screen.getByText("1 фото")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    expect(screen.getByText("От Вячеслава")).toBeInTheDocument();
  });

  it("shows different manual album lists in photo and video tabs", async () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Фото из альбома",
      storage_path: "trees/tree-1/media/photo/media-photo/album-photo.jpg",
    });
    const video = createMediaAsset({
      id: "media-video",
      kind: "video",
      title: "Видео из альбома",
      mime_type: "video/mp4",
      storage_path: "trees/tree-1/media/video/media-video/album-video.mp4",
    });

    renderArchiveClient({
      allAlbums: [
        {
          id: "album-photo",
          title: "Фотоальбом",
          description: null,
          kind: "photo",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
        {
          id: "album-video",
          title: "Видеоальбом",
          description: null,
          kind: "video",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-video",
        },
      ],
      persistedAlbumMediaMap: {
        "album-photo": [photo],
        "album-video": [video],
      },
      allMedia: [photo, video],
      initialThumbUrlsByMediaId: {
        "media-photo": "/api/media/media-photo?variant=thumb",
        "media-video": "/api/media/media-video?variant=thumb",
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Фотоальбом.*Пользовательский альбом/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Видеоальбом.*Пользовательский альбом/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Видеоальбом.*Пользовательский альбом/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Фотоальбом.*Пользовательский альбом/ })).not.toBeInTheDocument();
  }, 15000);

  it("drops a photo album from the albums tab after switching into video mode", () => {
    const photo = createMediaAsset({
      id: "media-photo",
      title: "Фото из альбома",
      storage_path: "trees/tree-1/media/photo/media-photo/album-photo.jpg",
    });

    renderArchiveClient({
      allAlbums: [
        {
          id: "album-1",
          title: "Семейный альбом",
          description: null,
          kind: "photo",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
      allMedia: [photo],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    fireEvent.click(screen.getByRole("button", { name: /Семейный альбом.*Пользовательский альбом/ }));

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));

    expect(screen.queryByText("Семейный альбом")).not.toBeInTheDocument();
    const emptyState = screen.getByText("Альбомов для этого раздела пока нет").closest(".empty-state");
    expect(emptyState).not.toBeNull();
    expect(within(emptyState as HTMLElement).getByRole("button", { name: "Создать альбом" })).toBeInTheDocument();
  });

  it("shows upload progress without the old transport hint noise", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url.includes("/api/media/archive/upload-intent")) {
        return Response.json(
          {
            mediaId: "archive-upload-1",
            kind: "photo",
            path: "trees/tree-1/media/photo/archive-upload-1/archive-photo.jpg",
            bucket: "bucket-1",
            signedUrl: "https://example.com/original",
            token: null,
            uploadProvider: "object_storage",
            configuredBackend: "cloudflare_r2",
            resolvedUploadBackend: "cloudflare_r2",
            rolloutState: "cloudflare_rollout_active",
            forceProxyUpload: true,
            uploadMode: "proxy",
            variantUploadMode: "server_proxy",
            variantTargets: [
              {
                variant: "thumb",
                path: "trees/tree-1/media/photo/archive-upload-1/variants/thumb.webp",
                signedUrl: "https://example.com/thumb",
                token: null,
                uploadProvider: "object_storage",
              },
            ],
          },
          { status: 201 }
        );
      }

      if (url.includes("/api/media/archive/complete")) {
        return Response.json(
          {
            message: "Материал сохранен в семейный архив.",
            uploaderAlbumId: "album-uploader-1",
            media: createMediaAsset({
              id: "archive-upload-1",
              title: "archive-photo.jpg",
              storage_path: "trees/tree-1/media/photo/archive-upload-1/archive-photo.jpg",
            }),
          },
          { status: 201 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    const view = renderArchiveClient();
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "archive-photo.jpg", { type: "image/jpeg" });

    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input);

    await screen.findByRole("dialog", { name: "Подготовка загрузки" });
    expect(screen.getByLabelText("Сводка выбранных файлов")).toHaveTextContent("1 файл");
    expect(screen.getByLabelText("Сводка выбранных файлов")).toHaveTextContent("1 фото");
    expect(screen.getByText("archive-photo.jpg")).toBeInTheDocument();
    expect(screen.getByText("Фото • 3 Б")).toBeInTheDocument();
    expect(screen.getByLabelText("Видимость")).toHaveTextContent("Только членам семьи");
    expect(screen.getByLabelText("Подпись")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить 1" }));

    await waitFor(() => {
      expect(uploadFileWithTransportContract).toHaveBeenCalled();
    });

    expect(screen.getByText("Материал сохранен в семейный архив.")).toBeInTheDocument();
  });

  it("inherits album access by default and hides visibility selection when uploading into a specific album", async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url, method: init?.method, body });

      if (url.includes("/api/media/archive/upload-intent")) {
        return Response.json(
          {
            mediaId: "archive-upload-public-1",
            kind: "photo",
            path: "trees/tree-1/media/photo/archive-upload-public-1/archive-photo.jpg",
            bucket: "bucket-1",
            signedUrl: "https://example.com/original",
            token: null,
            uploadProvider: "object_storage",
            configuredBackend: "cloudflare_r2",
            resolvedUploadBackend: "cloudflare_r2",
            rolloutState: "cloudflare_rollout_active",
            forceProxyUpload: true,
            uploadMode: "proxy",
            variantUploadMode: "server_proxy",
            variantTargets: [],
          },
          { status: 201 }
        );
      }

      if (url.includes("/api/media/archive/complete")) {
        return Response.json(
          {
            message: "Материал сохранен в семейный архив.",
            uploaderAlbumId: "album-uploader-public-1",
            media: createMediaAsset({
              id: "archive-upload-public-1",
              title: "album-photo.jpg",
              visibility: "public",
              storage_path: "trees/tree-1/media/photo/archive-upload-public-1/archive-photo.jpg",
            }),
          },
          { status: 201 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    const photo = createMediaAsset({
      id: "media-photo",
      title: "Фото из альбома",
      created_by: null,
      storage_path: "trees/tree-1/media/photo/media-photo/album-photo.jpg",
    });

    const view = renderArchiveClient({
      initialMode: "photo",
      initialView: "albums",
      initialAlbumId: "album-1",
      allMedia: [photo],
      allAlbums: [
        {
          id: "album-1",
          title: "Открытый альбом",
          description: "Альбом для семьи по ссылке",
          kind: "photo",
          access: "public",
          albumKind: "manual",
          uploaderUserId: null,
          count: 1,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo],
      },
    });

    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "album-photo.jpg", { type: "image/jpeg" });

    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input);

    const dialog = await screen.findByRole("dialog", { name: "Подготовка загрузки" });
    expect(within(dialog).getByText("Новые материалы попадут в альбом «Открытый альбом».")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Видимость")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Новые материалы унаследуют доступ альбома: по ссылке.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить 1" }));

    await waitFor(() => {
      expect(uploadFileWithTransportContract).toHaveBeenCalled();
    });

    const uploadIntentRequest = requests.find((request) => request.url.includes("/api/media/archive/upload-intent"));
    const completeRequest = requests.find((request) => request.url.includes("/api/media/archive/complete"));

    expect(uploadIntentRequest?.body).toMatchObject({
      visibility: "public",
      title: "album-photo.jpg",
    });
    expect(completeRequest?.body).toMatchObject({
      albumId: "album-1",
      visibility: "public",
      title: "album-photo.jpg",
    });
  }, 15000);

  it("shows a video preview tile in the archive upload review dialog for local video files", async () => {
    const view = renderArchiveClient();
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "archive-video.mp4", { type: "video/mp4" });

    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input);

    await screen.findByRole("dialog", { name: "Подготовка загрузки" });
    expect(document.querySelector("video.archive-tile-video")).not.toBeNull();
    expect(screen.getByText("archive-video.mp4")).toBeInTheDocument();
    expect(screen.getByLabelText("Сводка выбранных файлов")).toHaveTextContent("1 видео");
  }, 15000);

  it("shows a pending state while creating an album and defaults access to members", async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
    vi.spyOn(global, "fetch").mockImplementation(
      async (input, init) =>
        new Promise((resolve) => {
          const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
          requests.push({ url, method: init?.method, body });

          if (url.includes("/api/media/albums")) {
            setTimeout(
              () =>
                resolve(
                  Response.json(
                    {
                      message: "Альбом создан.",
                      album: {
                        id: "album-1",
                        tree_id: "tree-1",
                        title: "Новый альбом",
                        description: "",
                        kind: "photo",
                        access: "members",
                        album_kind: "manual",
                        uploader_user_id: null,
                        created_by: "user-1",
                        created_at: "2026-03-13T00:00:00.000Z",
                        updated_at: "2026-03-13T00:00:00.000Z",
                      },
                    },
                    { status: 201 }
                  )
                ),
              25
            );
            return;
          }

          resolve(Response.json({}, { status: 200 }));
        })
    );

    renderArchiveClient();

    fireEvent.click(screen.getAllByRole("button", { name: "Создать альбом" })[0]);
    expect(screen.getByLabelText("Название")).toHaveValue("Новый альбом");
    expect(screen.getByLabelText("Доступ")).toHaveTextContent("Только для семьи");
    expect(screen.getByText("Виден всем участникам семейного дерева")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Новый альбом" } });
    const dialog = screen.getByRole("dialog", { name: "Создать альбом" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать альбом" }));

    expect(screen.getByRole("button", { name: "Создаю альбом..." })).toBeDisabled();

    await screen.findByText("Альбом создан.");

    const createRequest = requests.find((request) => request.url.includes("/api/media/albums") && request.method === "POST");
    expect(createRequest?.body).toMatchObject({
      title: "Новый альбом",
      kind: "photo",
      access: "members",
    });
  }, 15000);

  it("persists selected public access during album creation and renders the album without a lock icon", async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url, method: init?.method, body });

      if (url.includes("/api/media/albums") && init?.method === "POST") {
        return Response.json(
          {
            message: "Альбом создан.",
            album: {
              id: "album-public-1",
              tree_id: "tree-1",
              title: "Открытый альбом",
              description: "Для всех по ссылке",
              kind: "photo",
              access: "public",
              album_kind: "manual",
              uploader_user_id: null,
              created_by: "user-1",
              created_at: "2026-03-13T00:00:00.000Z",
              updated_at: "2026-03-13T00:00:00.000Z",
            },
          },
          { status: 201 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    renderArchiveClient();

    fireEvent.click(screen.getAllByRole("button", { name: "Создать альбом" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Создать альбом" });
    const accessCombobox = within(dialog).getByRole("combobox", { name: /Доступ/ });
    const accessHiddenInput = accessCombobox.parentElement?.querySelector('input[aria-hidden="true"]') as HTMLInputElement | null;
    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Открытый альбом" } });
    fireEvent.change(within(dialog).getByLabelText("Описание"), { target: { value: "Для всех по ссылке" } });
    expect(accessHiddenInput).not.toBeNull();
    fireEvent.change(accessHiddenInput as HTMLInputElement, { target: { value: "public" } });
    fireEvent.input(accessHiddenInput as HTMLInputElement, { target: { value: "public" } });
    await waitFor(() => {
      expect(accessCombobox).toHaveTextContent("По ссылке");
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать альбом" }));

    await screen.findByText("Альбом создан.");

    const createRequest = requests.find((request) => request.url.includes("/api/media/albums") && request.method === "POST");
    expect(createRequest?.body).toMatchObject({
      title: "Открытый альбом",
      access: "public",
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    const createdAlbumButton = screen.getByRole("button", { name: /Открытый альбом.*Для всех по ссылке/ });
    expect(createdAlbumButton).toBeInTheDocument();
    const createdAlbumShell = createdAlbumButton.closest(".archive-album-card-shell");
    expect(createdAlbumShell).not.toBeNull();
    expect(createdAlbumShell?.querySelector(".archive-album-access-indicator")).toBeNull();
  }, 15000);
});
