import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AudioArchiveView } from "@/components/media/audio-archive-view";

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
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"));
  });
}

describe("audio playlists v1", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows playlist tracks ordered by position", () => {
    render(
      createElement(AudioArchiveView, {
        treeId: "tree-1",
        slug: "test-tree",
        canEdit: false,
        media: [
          createAudioAsset("audio-1", "Первая"),
          createAudioAsset("audio-2", "Вторая"),
        ] as any,
        playlists: [
          {
            id: "playlist-1",
            tree_id: "tree-1",
            name: "Колыбельные",
            created_at: "2026-04-01T00:00:00.000Z",
            updated_at: "2026-04-01T00:00:00.000Z",
          },
        ],
        playlistItems: [
          {
            id: "playlist-item-2",
            playlist_id: "playlist-1",
            media_id: "audio-2",
            position: 2,
            created_at: "2026-04-01T00:00:00.000Z",
          },
          {
            id: "playlist-item-1",
            playlist_id: "playlist-1",
            media_id: "audio-1",
            position: 1,
            created_at: "2026-04-01T00:00:00.000Z",
          },
        ],
        onMediaChange: () => undefined,
      })
    );

    fireEvent.click(screen.getByRole("tab", { name: "Плейлисты" }));
    fireEvent.click(screen.getByRole("button", { name: /Колыбельные/ }));

    const titles = Array.from(document.querySelectorAll(".audio-archive-title")).map((node) => node.textContent);
    expect(titles.slice(0, 2)).toEqual(["Первая", "Вторая"]);
  });

  it("uses playlist tracks as the playback source for next and previous", () => {
    mockAudioPlayback();

    render(
      createElement(AudioArchiveView, {
        treeId: "tree-1",
        slug: "test-tree",
        canEdit: false,
        media: [
          createAudioAsset("audio-1", "Первая"),
          createAudioAsset("audio-2", "Вторая"),
          createAudioAsset("audio-3", "Третья"),
        ] as any,
        playlists: [
          {
            id: "playlist-1",
            tree_id: "tree-1",
            name: "Колыбельные",
            created_at: "2026-04-01T00:00:00.000Z",
            updated_at: "2026-04-01T00:00:00.000Z",
          },
        ],
        playlistItems: [
          {
            id: "playlist-item-1",
            playlist_id: "playlist-1",
            media_id: "audio-2",
            position: 1,
            created_at: "2026-04-01T00:00:00.000Z",
          },
          {
            id: "playlist-item-2",
            playlist_id: "playlist-1",
            media_id: "audio-1",
            position: 2,
            created_at: "2026-04-01T00:00:00.000Z",
          },
        ],
        onMediaChange: () => undefined,
      })
    );

    fireEvent.click(screen.getByRole("tab", { name: "Плейлисты" }));
    fireEvent.click(screen.getByRole("button", { name: /Колыбельные/ }));

    const playlistRows = document.querySelectorAll(".audio-archive-row");
    fireEvent.click(within(playlistRows[0] as HTMLElement).getByRole("button", { name: "Воспроизвести" }));

    const player = screen.getByRole("region", { name: "Аудиоплеер" });
    expect(within(player).getByText("Вторая")).toBeInTheDocument();
    expect(within(player).getByText("Колыбельные")).toBeInTheDocument();

    fireEvent.click(within(player).getByRole("button", { name: "Следующий трек" }));
    expect(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByText("Первая")).toBeInTheDocument();
    expect(screen.queryByText("Третья", { selector: ".audio-player-title" })).toBeNull();

    fireEvent.click(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByRole("button", { name: "Предыдущий трек" }));
    expect(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByText("Вторая")).toBeInTheDocument();
  });

  it("switches playback source from the sticky player dropdown", () => {
    mockAudioPlayback();

    render(
      createElement(AudioArchiveView, {
        treeId: "tree-1",
        slug: "test-tree",
        canEdit: false,
        media: [
          createAudioAsset("audio-1", "Первая"),
          createAudioAsset("audio-2", "Вторая"),
          createAudioAsset("audio-3", "Третья"),
        ] as any,
        playlists: [
          {
            id: "playlist-1",
            tree_id: "tree-1",
            name: "Колыбельные",
            created_at: "2026-04-01T00:00:00.000Z",
            updated_at: "2026-04-01T00:00:00.000Z",
          },
        ],
        playlistItems: [
          {
            id: "playlist-item-1",
            playlist_id: "playlist-1",
            media_id: "audio-2",
            position: 1,
            created_at: "2026-04-01T00:00:00.000Z",
          },
          {
            id: "playlist-item-2",
            playlist_id: "playlist-1",
            media_id: "audio-1",
            position: 2,
            created_at: "2026-04-01T00:00:00.000Z",
          },
        ],
        onMediaChange: () => undefined,
      })
    );

    const allRows = document.querySelectorAll(".audio-archive-row");
    fireEvent.click(within(allRows[1] as HTMLElement).getByRole("button", { name: "Воспроизвести" }));

    const player = screen.getByRole("region", { name: "Аудиоплеер" });
    expect(within(player).getByText("Все аудио")).toBeInTheDocument();
    expect(within(player).getByText("Вторая")).toBeInTheDocument();

    fireEvent.click(within(player).getByRole("button", { name: "Источник воспроизведения: Все аудио" }));
    expect(screen.getByText("✓", { selector: ".audio-player-source-option-check-active" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть плейлисты" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Источник воспроизведения: Колыбельные" }));

    expect(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByText("Колыбельные")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByRole("button", { name: "Следующий трек" }));
    expect(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByText("Первая")).toBeInTheDocument();
    expect(screen.queryByText("Третья", { selector: ".audio-player-title" })).toBeNull();

    fireEvent.click(within(screen.getByRole("region", { name: "Аудиоплеер" })).getByRole("button", { name: "Источник воспроизведения: Колыбельные" }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть плейлисты" }));
    expect(screen.getByText("Колыбельные", { selector: ".audio-playlist-open strong" })).toBeInTheDocument();
  }, 10000);

  it("adds the current track to an existing playlist directly from the popover", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

      if (url.endsWith("/api/media/playlists/items") && init?.method === "POST") {
        return Response.json(
          {
            item: {
              id: "playlist-item-new",
              playlist_id: body?.playlistId,
              media_id: body?.mediaId,
              position: 1,
              created_at: "2026-04-01T00:00:00.000Z",
            },
            message: "Трек добавлен в плейлист.",
          },
          { status: 201 }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      createElement(AudioArchiveView, {
        treeId: "tree-1",
        slug: "test-tree",
        canEdit: true,
        media: [createAudioAsset("audio-1", "Первая")] as any,
        playlists: [
          {
            id: "playlist-1",
            tree_id: "tree-1",
            name: "Колыбельные",
            created_at: "2026-04-01T00:00:00.000Z",
            updated_at: "2026-04-01T00:00:00.000Z",
          },
        ],
        playlistItems: [],
        onMediaChange: () => undefined,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "В плейлист" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить в плейлист «Колыбельные»" }));

    expect(await screen.findByText("Добавлено в «Колыбельные»")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/media/playlists/items",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("creates a new playlist inside the add-to-playlist popover with Enter and immediately adds the current track", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

      if (url.endsWith("/api/media/playlists") && init?.method === "POST") {
        return Response.json(
          {
            playlist: {
              id: "playlist-new",
              tree_id: "tree-1",
              name: body?.name,
              created_at: "2026-04-01T00:00:00.000Z",
              updated_at: "2026-04-01T00:00:00.000Z",
            },
            message: "Плейлист создан.",
          },
          { status: 201 }
        );
      }

      if (url.endsWith("/api/media/playlists/items") && init?.method === "POST") {
        return Response.json(
          {
            item: {
              id: "playlist-item-new",
              playlist_id: body?.playlistId,
              media_id: body?.mediaId,
              position: 1,
              created_at: "2026-04-01T00:00:00.000Z",
            },
            message: "Трек добавлен в плейлист.",
          },
          { status: 201 }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      createElement(AudioArchiveView, {
        treeId: "tree-1",
        slug: "test-tree",
        canEdit: true,
        media: [createAudioAsset("audio-1", "Первая")] as any,
        playlists: [],
        playlistItems: [],
        onMediaChange: () => undefined,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "В плейлист" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Новый плейлист" }));
    const input = screen.getByPlaceholderText("Название плейлиста");
    fireEvent.change(input, { target: { value: "Любимые" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Создан плейлист «Любимые» и трек добавлен")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "/api/media/playlists",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/media/playlists/items",
      expect.objectContaining({ method: "POST" })
    );

    fireEvent.click(screen.getByRole("tab", { name: "Плейлисты" }));
    expect(screen.getByRole("button", { name: /Любимые/ })).toBeInTheDocument();
  });

  it("returns from inline playlist creation to the playlist list on Escape", () => {
    render(
      createElement(AudioArchiveView, {
        treeId: "tree-1",
        slug: "test-tree",
        canEdit: true,
        media: [createAudioAsset("audio-1", "Первая")] as any,
        playlists: [
          {
            id: "playlist-1",
            tree_id: "tree-1",
            name: "Колыбельные",
            created_at: "2026-04-01T00:00:00.000Z",
            updated_at: "2026-04-01T00:00:00.000Z",
          },
        ],
        playlistItems: [],
        onMediaChange: () => undefined,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "В плейлист" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Новый плейлист" }));

    const input = screen.getByPlaceholderText("Название плейлиста");
    fireEvent.change(input, { target: { value: "Черновик" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByPlaceholderText("Название плейлиста")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "В плейлист" }));
    expect(screen.getByRole("button", { name: "Добавить в плейлист «Колыбельные»" })).toBeInTheDocument();
  });
});
