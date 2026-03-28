import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    kind?: "photo" | "video";
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

  it("opens archive media in a large viewer and navigates to an external video", () => {
    renderArchiveClient();

    fireEvent.click(screen.getByRole("button", { name: "Открыть фото: Архивное фото" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное фото" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Архивное фото" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Следующее медиа" }));
    expect(within(dialog).getByRole("heading", { name: "Архивное видео" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Следующее медиа" }));
    expect(within(dialog).getByRole("heading", { name: "Внешнее видео архива" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("link", { name: "Открыть внешнее видео" })[0]).toHaveAttribute("href", "/api/media/media-external");
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
    });

    const tileImage = await screen.findByRole("img", { hidden: true }).catch(() => null);
    const firstArchiveImage = document.querySelector(".archive-tile-image");
    expect(tileImage || firstArchiveImage).not.toBeNull();
    expect(firstArchiveImage).toHaveAttribute("src", "/api/media/media-legacy-photo");

    fireEvent.click(screen.getByRole("button", { name: "Открыть фото: Архивное фото" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное фото" });
    expect(within(dialog).getByRole("img", { name: "Архивное фото" })).toHaveAttribute("src", "/api/media/media-legacy-photo");
  });

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
    });

    const tileImage = document.querySelector(".archive-tile-image");
    expect(tileImage).not.toBeNull();
    expect(tileImage).toHaveAttribute("src", "/api/media/media-photo?variant=thumb");

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    const albumImage = document.querySelector(".archive-album-image");
    expect(albumImage).not.toBeNull();
    expect(albumImage).toHaveAttribute("src", "/api/media/media-photo?variant=thumb");

    fireEvent.click(screen.getByRole("button", { name: /Свадьба.*Пользовательский альбом/ }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть фото: Архивное фото" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное фото" });
    expect(within(dialog).getByRole("img", { name: "Архивное фото" })).toHaveAttribute("src", "/api/media/media-photo?variant=medium");
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
    });

    const tileImage = document.querySelector(".archive-tile-image");
    expect(tileImage).not.toBeNull();
    expect(tileImage).toHaveAttribute("src", "/api/media/media-video?variant=thumb");

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    const albumImage = document.querySelector(".archive-album-image");
    expect(albumImage).not.toBeNull();
    expect(albumImage).toHaveAttribute("src", "/api/media/media-video?variant=thumb");
  });

  it("updates a newly uploaded cloudflare video album cover to its generated preview without a full page reload", async () => {
    let summaryCalls = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url.includes("/api/media/archive/upload-intent")) {
        return Response.json(
          {
            mediaId: "archive-video-pending-1",
            kind: "video",
            path: "trees/tree-1/media/video/archive-video-pending-1/archive-video.webm",
            bucket: "bucket-1",
            signedUrl: "https://example.com/original",
            token: null,
            uploadProvider: "cloudflare_r2",
            configuredBackend: "cloudflare_r2",
            resolvedUploadBackend: "cloudflare_r2",
            rolloutState: "cloudflare_rollout_active",
            forceProxyUpload: false,
            uploadMode: "direct",
            variantUploadMode: "none",
            variantTargets: [],
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
              id: "archive-video-pending-1",
              kind: "video",
              provider: "cloudflare_r2",
              preview_status: "pending",
              title: "archive-video.webm",
              mime_type: "video/webm",
              storage_path: "trees/tree-1/media/video/archive-video-pending-1/archive-video.webm",
            }),
          },
          { status: 201 }
        );
      }

      if (url.includes("/api/media/archive-video-pending-1?summary=1")) {
        summaryCalls += 1;
        return Response.json(
          {
            media: createMediaAsset({
              id: "archive-video-pending-1",
              kind: "video",
              provider: "cloudflare_r2",
              preview_status: summaryCalls >= 2 ? "ready" : "pending",
              title: "archive-video.webm",
              mime_type: "video/webm",
              storage_path: "trees/tree-1/media/video/archive-video-pending-1/archive-video.webm",
            }),
          },
          { status: 200 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    renderArchiveClient({
      initialMode: "video",
      initialView: "albums",
      allMedia: [],
      allAlbums: [],
      persistedAlbumMediaMap: {},
      uploaderLabels: [{ userId: "user-1", label: "От Вячеслава" }],
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "archive-video.webm", { type: "video/webm" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input);

    const dialog = await screen.findByRole("dialog", { name: "Подготовка загрузки" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить 1" }));

    await waitFor(() => {
      const albumImage = document.querySelector(".archive-album-image");
      expect(albumImage).not.toBeNull();
      expect(albumImage).toHaveAttribute("src", "/api/media/archive-video-pending-1?variant=thumb");
    }, { timeout: 5000 });
  }, 10000);

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
    expect(uploaderAlbumButtons[0]).toHaveTextContent("3 материалов");

    fireEvent.click(uploaderAlbumButtons[0]);

    expect(screen.getAllByText("От Вячеслава").length).toBeGreaterThan(0);
    expect(screen.getByText("3 материалов")).toBeInTheDocument();

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
    expect(screen.getByRole("button", { name: /Свадьба.*2 материалов/ })).toBeInTheDocument();
  }, 10000);

  it("shows contextual empty-state actions when the current archive mode is empty", () => {
    renderArchiveClient({ allMedia: [] });

    const emptyState = screen.getByText("Семейный архив пока пуст").closest(".empty-state");
    expect(emptyState).not.toBeNull();
    expect(within(emptyState as HTMLElement).getByRole("button", { name: "Загрузить файлы" })).toBeInTheDocument();
    expect(within(emptyState as HTMLElement).getByRole("button", { name: "Создать альбом" })).toBeInTheDocument();
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
        uploaderLabels={[{ userId: "user-1", label: "От Вячеслава" }]}
      />
    );

    expect(screen.getAllByText("От Вячеслава").length).toBeGreaterThan(0);
    expect(screen.getByText("1 фото")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    expect(screen.getByText("От Вячеслава")).toBeInTheDocument();
  });

  it("shows different manual album lists in photo and video tabs", () => {
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
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    expect(screen.getByRole("button", { name: /Фотоальбом.*Пользовательский альбом/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Видеоальбом.*Пользовательский альбом/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));
    expect(screen.getByRole("button", { name: /Видеоальбом.*Пользовательский альбом/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Фотоальбом.*Пользовательский альбом/ })).not.toBeInTheDocument();
  });

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
  });

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
  });

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
  });

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
  });
});
