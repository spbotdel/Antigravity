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
    created_by: "user-1",
    created_at: "2026-03-09T00:00:00.000Z",
    ...overrides,
  };
}

function renderArchiveClient(options?: {
  allMedia?: MediaAssetRecord[];
  allAlbums?: Array<{
    id: string;
    title: string;
    description: string | null;
    albumKind: "manual" | "uploader";
    uploaderUserId: string | null;
    count: number;
    coverMediaId: string | null;
  }>;
  persistedAlbumMediaMap?: Record<string, MediaAssetRecord[]>;
  canEdit?: boolean;
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
      initialMode="all"
      initialView="all"
      initialAlbumId={null}
      allMedia={allMedia}
      allAlbums={options?.allAlbums || []}
      persistedAlbumMediaMap={options?.persistedAlbumMediaMap || {}}
      uploaderLabels={[]}
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

  it("renders sticky archive actions for the current context", () => {
    renderArchiveClient();

    expect(screen.getAllByRole("button", { name: "Загрузить файлы" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Создать альбом" }).length).toBeGreaterThan(0);
    expect(screen.getByText("3 материалов в текущем режиме")).toBeInTheDocument();
  });

  it("shows visible tile copy and album descriptions in the archive grid", () => {
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

    expect(screen.getByText("Семейный портрет")).toBeInTheDocument();
    expect(screen.getByText("Главная фотография архива")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    expect(screen.getByText("Большая семейная подборка со свадьбы")).toBeInTheDocument();
  });

  it("shows only download and album actions in the archive card menu for read-only viewers", async () => {
    renderArchiveClient({ canEdit: false });

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Архивное фото»" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Скачать" })).toBeInTheDocument();
    });
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

  it("opens album view and keeps album-specific sticky actions", () => {
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
          id: "album-1",
          title: "Свадьба",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 2,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo, video],
      },
      allMedia: [photo, video],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    fireEvent.click(screen.getByRole("button", { name: /Свадьба.*Пользовательский альбом/ }));

    expect(screen.getAllByRole("button", { name: "Назад к альбомам" }).length).toBeGreaterThan(0);
    expect(screen.getByText("2 материалов в альбоме")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Открыть фото: Фото из альбома" }));
    expect(screen.getByRole("dialog", { name: "Просмотр архива: Фото из альбома" })).toBeInTheDocument();
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
        initialAlbumId="uploader-user-1"
        allMedia={[photo]}
        allAlbums={[]}
        persistedAlbumMediaMap={{}}
        uploaderLabels={[{ userId: "user-1", label: "От Вячеслава" }]}
      />
    );

    expect(screen.getAllByText("От Вячеслава").length).toBeGreaterThan(0);
    expect(screen.getByText("1 фото в альбоме")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Назад к альбомам" }).length).toBeGreaterThan(0);
  });

  it("keeps the selected manual album while switching between photo and video modes", () => {
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
          id: "album-1",
          title: "Свадьба",
          description: null,
          albumKind: "manual",
          uploaderUserId: null,
          count: 2,
          coverMediaId: "media-photo",
        },
      ],
      persistedAlbumMediaMap: {
        "album-1": [photo, video],
      },
      allMedia: [photo, video],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Альбомы" }));
    fireEvent.click(screen.getByRole("button", { name: /Свадьба.*Пользовательский альбом/ }));

    expect(screen.getAllByText("Свадьба").length).toBeGreaterThan(0);
    expect(screen.getByText("2 материалов в альбоме")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));
    expect(screen.getAllByText("Свадьба").length).toBeGreaterThan(0);
    expect(screen.getByText("1 видео в альбоме")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть видео: Видео из альбома" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    expect(screen.getAllByText("Свадьба").length).toBeGreaterThan(0);
    expect(screen.getByText("1 фото в альбоме")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть фото: Фото из альбома" })).toBeInTheDocument();
  });

  it("keeps a manual album open and shows an empty state when the selected mode has no items", () => {
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

    expect(screen.getAllByText("Семейный альбом").length).toBeGreaterThan(0);
    expect(screen.getByText("0 видео в альбоме")).toBeInTheDocument();
    expect(screen.getByText("В альбоме «Семейный альбом» пока нет материалов этого типа")).toBeInTheDocument();
    const emptyState = screen.getByText("В альбоме «Семейный альбом» пока нет материалов этого типа").closest(".empty-state");
    expect(emptyState).not.toBeNull();
    expect(within(emptyState as HTMLElement).getByRole("button", { name: "Загрузить видео" })).toBeInTheDocument();
    expect(within(emptyState as HTMLElement).getByRole("button", { name: "Назад к альбомам" })).toBeInTheDocument();
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

  it("shows a pending state while creating an album", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async (input) =>
        new Promise((resolve) => {
          const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
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
    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Новый альбом" } });
    const dialog = screen.getByRole("dialog", { name: "Создать альбом" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать альбом" }));

    expect(screen.getByRole("button", { name: "Создаю альбом..." })).toBeDisabled();

    await screen.findByText("Альбом создан.");
  });
});
