import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

    expect(screen.getByRole("heading", { name: "Семейное фото" })).toBeInTheDocument();
    expect(document.querySelector("img.person-media-stage-photo-inline")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Семейное видео" }));

    expect(screen.getByRole("heading", { name: "Семейное видео" })).toBeInTheDocument();
    expect(document.querySelector("video.person-media-stage-video-inline")).not.toBeNull();
  });

  it("opens a fullscreen dialog and navigates through media items", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Развернуть медиа" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Семейное видео" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector("video.person-media-stage-video")).not.toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Следующее медиа" }));

    expect(within(dialog).getByRole("heading", { name: "Внешнее видео" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("link", { name: "Открыть внешнее видео" })[0]).toHaveAttribute("href", "/api/media/media-external-video");

    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть просмотр" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
