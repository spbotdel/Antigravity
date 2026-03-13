import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

import { PersonMediaGallery } from "@/components/tree/person-media-gallery";
import type { TreeSnapshot } from "@/lib/types";

function createMediaAsset(overrides: Partial<TreeSnapshot["media"][number]>): TreeSnapshot["media"][number] {
  return {
    id: "media-default",
    tree_id: "tree-1",
    kind: "photo",
    provider: "object_storage",
    visibility: "members",
    storage_path: "trees/tree-1/media/photo/default/file.jpg",
    external_url: null,
    title: "Default media",
    caption: "Default caption",
    mime_type: "image/jpeg",
    size_bytes: 1024,
    created_by: "user-1",
    created_at: "2026-03-07T00:00:00.000Z",
    ...overrides
  };
}

describe("person media gallery", () => {
  it("falls back to the original media route for legacy photos without variants", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-legacy-photo",
            title: "Архивное фото",
            created_at: "2026-03-07T00:00:00.000Z",
            storage_path: "trees/tree-1/media/photo/media-legacy-photo/photo.jpg"
          }),
          createMediaAsset({
            id: "media-legacy-photo-2",
            title: "Второе архивное фото",
            created_at: "2026-03-07T00:00:00.000Z",
            storage_path: "trees/tree-1/media/photo/media-legacy-photo-2/photo.jpg"
          })
        ]}
      />
    );

    const stageImage = document.querySelector("img.person-media-stage-photo-inline");
    expect(stageImage).not.toBeNull();
    expect(stageImage).toHaveAttribute("src", "/api/media/media-legacy-photo");

    const thumbImage = document.querySelector(".person-media-thumb-visual img");
    expect(thumbImage).not.toBeNull();
    expect(thumbImage).toHaveAttribute("src", "/api/media/media-legacy-photo");
  });

  it("switches from photo preview to stored video playback", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo",
            title: "Семейное фото",
            storage_path: "trees/tree-1/media/photo/media-photo/photo.jpg"
          }),
          createMediaAsset({
            id: "media-video",
            kind: "video",
            title: "Семейное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video/video.mp4"
          })
        ]}
      />
    );

    expect(document.querySelector("img.person-media-stage-photo-inline")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Семейное видео" }));

    expect(screen.getByRole("heading", { name: "Семейное видео" })).toBeInTheDocument();
    expect(document.querySelector("video.person-media-stage-video-inline")).not.toBeNull();
  });

  it("uses preview variants for fresh photo stage, thumbs, and fullscreen view", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo",
            title: "Семейное фото",
            created_at: "2026-03-09T00:00:00.000Z",
            storage_path: "trees/tree-1/media/photo/media-photo/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Второе фото",
            created_at: "2026-03-09T00:00:00.000Z",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          })
        ]}
      />
    );

    const stageImage = document.querySelector("img.person-media-stage-photo-inline");
    expect(stageImage).not.toBeNull();
    expect(stageImage).toHaveAttribute("src", "/api/media/media-photo?variant=small");

    const thumbImage = document.querySelector(".person-media-thumb-visual img");
    expect(thumbImage).not.toBeNull();
    expect(thumbImage).toHaveAttribute("src", "/api/media/media-photo?variant=thumb");

    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const expandedImage = document.querySelector(".media-lightbox-stage img.person-media-stage-photo");
    expect(expandedImage).not.toBeNull();
    expect(expandedImage).toHaveAttribute("src", "/api/media/media-photo?variant=medium");
  });

  it("opens a fullscreen dialog from the shared gallery action and navigates through media items", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo",
            title: "Семейное фото",
            storage_path: "trees/tree-1/media/photo/media-photo/photo.jpg"
          }),
          createMediaAsset({
            id: "media-video",
            kind: "video",
            title: "Семейное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video/video.mp4"
          }),
          createMediaAsset({
            id: "media-external-video",
            kind: "video",
            provider: "yandex_disk",
            title: "Внешнее видео",
            storage_path: null,
            external_url: "https://example.com/external-video"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Семейное видео" }));
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Семейное видео" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector("video.person-media-stage-video")).not.toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Следующее медиа" }));

    expect(within(dialog).getByRole("heading", { name: "Внешнее видео" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("link", { name: "Открыть внешнее видео" })[0]).toHaveAttribute("href", "/api/media/media-external-video");

    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть просмотр" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders a sticky gallery footer summary by default", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo",
            title: "Семейное фото",
            storage_path: "trees/tree-1/media/photo/media-photo/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Второе фото",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          })
        ]}
      />
    );

    expect(screen.getByText("2 материала в галерее")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Показать все" })).toBeInTheDocument();
  });

  it("keeps the same gallery action for external-only items and still exposes the direct link", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-external-video",
            kind: "video",
            provider: "yandex_disk",
            title: "Внешнее видео",
            storage_path: null,
            external_url: "https://example.com/external-video"
          })
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "Показать все" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Открыть внешнее видео" })[0]).toHaveAttribute("href", "/api/media/media-external-video");

    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Внешнее видео" })).toBeInTheDocument();
  });

  it("can disable the sticky gallery footer when the parent surface renders its own actions", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo",
            title: "Семейное фото",
            storage_path: "trees/tree-1/media/photo/media-photo/photo.jpg"
          })
        ]}
        showStickyFooter={false}
      />
    );

    expect(screen.queryByText("1 материал в галерее")).not.toBeInTheDocument();
  });

  it("shows avatar state for the selected primary photo", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo",
            title: "Семейное фото",
            storage_path: "trees/tree-1/media/photo/media-photo/photo.jpg"
          }),
          createMediaAsset({
            id: "media-video",
            kind: "video",
            title: "Семейное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video/video.mp4"
          })
        ]}
        avatarMediaId="media-photo"
      />
    );

    expect(screen.getByText("Аватар")).toBeInTheDocument();
  });

  it("renders the empty state safely when avatar selection is available but the gallery is empty", () => {
    const onSetAvatar = vi.fn();

    render(<PersonMediaGallery media={[]} onSetAvatar={onSetAvatar} emptyMessage="Пока пусто" />);

    expect(screen.getByText("Пока пусто")).toBeInTheDocument();
  });

  it("renders a contextual empty-state title and action when configured", () => {
    render(
      <PersonMediaGallery
        media={[]}
        emptyTitle="Фотографий пока нет"
        emptyMessage="Когда снимки появятся, они будут собраны здесь."
        emptyActions={<button type="button">Выбрать фото</button>}
      />
    );

    expect(screen.getByText("Фотографий пока нет")).toBeInTheDocument();
    expect(screen.getByText("Когда снимки появятся, они будут собраны здесь.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выбрать фото" })).toBeInTheDocument();
  });

  it("allows setting the active photo as avatar from the stage actions", async () => {
    const onSetAvatar = vi.fn().mockResolvedValue(undefined);

    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo",
            title: "Семейное фото",
            storage_path: "trees/tree-1/media/photo/media-photo/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Второе фото",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          })
        ]}
        avatarMediaId="media-photo-2"
        onSetAvatar={onSetAvatar}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Сделать фото профиля" }));
    });

    expect(onSetAvatar).toHaveBeenCalledWith("media-photo");
  });
});
