import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
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
    preview_status: null,
    preview_error: null,
    preview_attempt_count: 0,
    preview_claimed_at: null,
    created_by: "user-1",
    created_at: "2026-03-07T00:00:00.000Z",
    ...overrides
  } as TreeSnapshot["media"][number];
}

function mockRect(element: Element, { left, top = 0, width, height }: { left: number; top?: number; width: number; height: number }) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({})
    })
  });
}

function mockHorizontalScrollContainer(
  container: HTMLDivElement,
  {
    clientWidth,
    scrollWidth,
    scrollLeft,
    left = 0,
    top = 0,
    height = 64
  }: {
    clientWidth: number;
    scrollWidth: number;
    scrollLeft: number;
    left?: number;
    top?: number;
    height?: number;
  }
) {
  let currentScrollLeft = scrollLeft;

  Object.defineProperty(container, "clientWidth", { configurable: true, value: clientWidth });
  Object.defineProperty(container, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(container, "scrollLeft", {
    configurable: true,
    get: () => currentScrollLeft,
    set: (value: number) => {
      currentScrollLeft = value;
    }
  });

  mockRect(container, { left, top, width: clientWidth, height });

  const scrollTo = vi.fn(({ left: nextLeft }: ScrollToOptions) => {
    if (typeof nextLeft === "number") {
      currentScrollLeft = nextLeft;
    }
  });

  Object.defineProperty(container, "scrollTo", {
    configurable: true,
    value: scrollTo
  });

  return scrollTo;
}

const LIGHTBOX_STRIP_CENTER_THRESHOLD_PX = 16;

function mockScrollableThumb(
  element: Element,
  container: HTMLDivElement,
  { contentLeft, top = 0, width, height }: { contentLeft: number; top?: number; width: number; height: number }
) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => {
      const containerRect = container.getBoundingClientRect();
      const left = containerRect.left + contentLeft - container.scrollLeft;

      return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({})
      };
    }
  });
}

function createTouchPoint(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    identifier: 1,
  };
}

function swipeElement(element: Element, points: { startX: number; startY: number; endX: number; endY: number }) {
  const startTouch = createTouchPoint(points.startX, points.startY);
  const endTouch = createTouchPoint(points.endX, points.endY);

  fireEvent.touchStart(element, {
    touches: [startTouch],
    changedTouches: [startTouch],
  });
  fireEvent.touchMove(element, {
    touches: [endTouch],
    changedTouches: [endTouch],
  });
  fireEvent.touchEnd(element, {
    touches: [],
    changedTouches: [endTouch],
  });
}

function StatefulDeleteGallery({
  initialMedia,
  onDelete,
}: {
  initialMedia: TreeSnapshot["media"];
  onDelete?: (mediaId: string) => Promise<void>;
}) {
  const [media, setMedia] = useState(initialMedia);

  return (
    <PersonMediaGallery
      media={media}
      showStage={false}
      showStickyFooter={false}
      canDeleteMedia={Boolean(onDelete)}
      onDeleteMedia={
        onDelete
          ? async (mediaId) => {
              await onDelete(mediaId);
              setMedia((currentMedia) => currentMedia.filter((asset) => asset.id !== mediaId));
            }
          : undefined
      }
    />
  );
}

function StatefulSelectableGallery({
  initialMedia,
}: {
  initialMedia: TreeSnapshot["media"];
}) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(() => new Set());

  return (
    <PersonMediaGallery
      media={initialMedia}
      showStage={false}
      showStickyFooter={false}
      showInlineMediaActions
      canManageInlineMediaActions
      getInlineMediaAlbumHref={() => "/tree/demo-tree/media?mode=photo&view=albums"}
      selectionMode={selectionMode}
      canSelectMedia
      selectedMediaIds={selectedMediaIds}
      onStartMediaSelection={(mediaId) => {
        setSelectionMode(true);
        setSelectedMediaIds(new Set([mediaId]));
      }}
      onToggleMediaSelection={(mediaId) => {
        setSelectedMediaIds((currentSelection) => {
          const nextSelection = new Set(currentSelection);
          if (nextSelection.has(mediaId)) {
            nextSelection.delete(mediaId);
          } else {
            nextSelection.add(mediaId);
          }
          if (!nextSelection.size) {
            setSelectionMode(false);
          }
          return nextSelection;
        });
      }}
    />
  );
}

describe("person media gallery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

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

  it("shows resilient placeholders when a thumb or stage image fails to load", async () => {
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

    const stageImage = document.querySelector("img.person-media-stage-photo-inline") as HTMLImageElement | null;
    expect(stageImage).not.toBeNull();
    fireEvent.error(stageImage as HTMLImageElement);

    expect(screen.getByText("Файл временно недоступен")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть файл" })).toHaveAttribute("href", "/api/media/media-photo");

    const firstThumbButton = screen.getByRole("button", { name: "Показать медиа 1: Семейное фото" });
    const thumbImage = firstThumbButton.querySelector("img") as HTMLImageElement | null;
    expect(thumbImage).not.toBeNull();
    fireEvent.error(thumbImage as HTMLImageElement);

    await waitFor(() => {
      expect(firstThumbButton.querySelector("img")).toBeNull();
    });
    expect(firstThumbButton.querySelector(".person-media-thumb-icon")).not.toBeNull();
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
    expect(screen.getByRole("heading", { name: "Семейное фото" })).toBeInTheDocument();
    expect(screen.getByText("Фото")).toBeInTheDocument();
    const videoThumbButton = screen.getByRole("button", { name: "Показать медиа 2: Семейное видео" });
    expect(videoThumbButton).toBeInTheDocument();
    const videoThumb = videoThumbButton.querySelector("video.person-media-thumb-video") as HTMLVideoElement | null;
    expect(videoThumb).not.toBeNull();
    expect(videoThumb).toHaveAttribute("src", "/api/media/media-video?source=person-media-thumb-video");

    fireEvent.click(videoThumbButton);

    expect(screen.getByRole("heading", { name: "Семейное видео" })).toBeInTheDocument();
    const stageVideo = document.querySelector("video.person-media-stage-video-inline") as HTMLVideoElement | null;
    expect(stageVideo).not.toBeNull();
    expect(stageVideo?.preload).toBe("none");
    expect(stageVideo?.hasAttribute("controls")).toBe(false);
    expect(screen.getByRole("button", { name: "Воспроизвести видео" })).toBeInTheDocument();
    expect(screen.getByLabelText("Позиция видео")).toBeInTheDocument();
    expect(screen.getByLabelText("Громкость")).toBeInTheDocument();
  });

  it("uses a generated thumb image for ready cloudflare video previews", () => {
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
            provider: "cloudflare_r2",
            preview_status: "ready",
            title: "Семейное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video/video.mp4"
          })
        ]}
      />
    );

    const thumbImage = screen
      .getByRole("button", { name: "Показать медиа 2: Семейное видео" })
      .querySelector("img");
    expect(thumbImage).not.toBeNull();
    expect(thumbImage).toHaveAttribute("src", "/api/media/media-video?variant=thumb");

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Семейное видео" }));

    expect(document.querySelector(".person-media-thumb-video-placeholder")).toBeNull();
    const stageVideo = document.querySelector("video.person-media-stage-video-inline") as HTMLVideoElement | null;
    expect(stageVideo).not.toBeNull();
    expect(stageVideo?.preload).toBe("none");
    expect(stageVideo?.hasAttribute("controls")).toBe(false);
    expect(screen.getByRole("button", { name: "Воспроизвести видео" })).toBeInTheDocument();
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
    vi.useFakeTimers();

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
    const stageVideo = dialog.querySelector("video.person-media-stage-video") as HTMLVideoElement | null;
    expect(stageVideo).not.toBeNull();
    expect(stageVideo?.getAttribute("style")).toBeNull();
    expect(dialog.querySelector(".person-media-stage-video-shell")?.getAttribute("style")).toBeNull();
    expect(stageVideo?.hasAttribute("controls")).toBe(false);
    expect(stageVideo?.getAttribute("playsinline")).not.toBeNull();
    expect(dialog.querySelector(".media-lightbox-player-toolbar .media-lightbox-close")).not.toBeNull();
    expect(dialog.querySelector(".media-lightbox-player-toolbar .media-lightbox-fullscreen-toggle")).not.toBeNull();
    expect(dialog.querySelector(".media-lightbox-player-stage .media-lightbox-nav-left")).not.toBeNull();
    expect(dialog.querySelector(".media-lightbox-player-stage .media-lightbox-nav-right")).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Воспроизвести видео" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Позиция видео")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Закрыть просмотр" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Закрыть просмотр" })).toHaveLength(1);
    const stripVideoThumb = dialog.querySelector(".media-lightbox-strip-fixed video.person-media-thumb-video") as HTMLVideoElement | null;
    expect(stripVideoThumb).not.toBeNull();
    expect(stripVideoThumb).toHaveAttribute("src", "/api/media/media-video?source=person-media-thumb-video");

    fireEvent.click(within(dialog).getByRole("button", { name: "Следующее медиа" }));

    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Внешнее видео" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("link", { name: "Открыть внешнее видео" })[0]).toHaveAttribute("href", "/api/media/media-external-video");

    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть просмотр" }));
    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Внешнее видео" })).toHaveClass("media-lightbox-closing");

    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can open the shared lightbox in lightbox-only mode for archive reuse", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-video",
            kind: "video",
            title: "Архивное видео",
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
        showStage={false}
        showStickyFooter={false}
        lightboxOnly
        openLightboxOnMount
        initialActiveMediaId="media-video"
        lightboxAriaLabelPrefix="Просмотр архива"
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector("video.person-media-stage-video")).not.toBeNull();
    expect(screen.queryByText("Архивное видео")).not.toBeInTheDocument();
    expect(screen.queryByText("2 материала в галерее")).not.toBeInTheDocument();
  });

  it("closes the lightbox on browser back and stays on the current page surface", () => {
    vi.useFakeTimers();
    window.history.replaceState({ page: "gallery" }, "", "/tree/demo-family/media?mode=video");

    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-video",
            kind: "video",
            title: "Архивное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video/video.mp4"
          }),
          createMediaAsset({
            id: "media-video-2",
            kind: "video",
            title: "Второе архивное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video-2/video.mp4"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
        lightboxOnly
        openLightboxOnMount
        initialActiveMediaId="media-video"
        lightboxAriaLabelPrefix="Просмотр архива"
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
    expect(dialog).toBeInTheDocument();
    expect(typeof window.history.state?.__personMediaLightboxEntryId).toBe("string");

    act(() => {
      window.history.replaceState({ page: "gallery" }, "", window.location.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state: { page: "gallery" } }));
    });

    expect(screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" })).toHaveClass("media-lightbox-closing");

    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/tree/demo-family/media");
    expect(window.location.search).toBe("?mode=video");
  });

  it("autoplays archive-style lightbox video by default with metadata preload", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());

    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-video",
            kind: "video",
            title: "Архивное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video/video.mp4"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
        lightboxOnly
        openLightboxOnMount
        initialActiveMediaId="media-video"
        lightboxAriaLabelPrefix="Просмотр архива"
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
    const video = dialog.querySelector("video.person-media-stage-video") as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    expect(video?.muted).toBe(false);
    expect(video?.preload).toBe("metadata");
    expect(video?.autoplay).toBe(true);
    expect(video?.hasAttribute("controls")).toBe(false);
    expect(playSpy).toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Воспроизвести видео" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Громкость")).toBeInTheDocument();
  });

  it("enters the dedicated phone video mode and transitions through loading, ready, and playing states", () => {
    const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    try {
      render(
        <PersonMediaGallery
          media={[
            createMediaAsset({
              id: "media-video",
              kind: "video",
              title: "Архивное видео",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/media-video/video.mp4"
            })
          ]}
          showStage={false}
          showStickyFooter={false}
          lightboxOnly
          openLightboxOnMount
          initialActiveMediaId="media-video"
          lightboxAriaLabelPrefix="Просмотр архива"
        />
      );

      const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
      const stage = dialog.querySelector(".person-media-stage-video-shell-phone") as HTMLElement | null;
      const video = dialog.querySelector("video.person-media-stage-video") as HTMLVideoElement | null;
      expect(dialog).toHaveClass("media-lightbox-phone-video-mode");
      expect(dialog.querySelector(".media-lightbox-player-stage")).toBeNull();
      expect(stage).not.toBeNull();
      expect(video).not.toBeNull();
      expect(stage).toHaveAttribute("data-stage-state", "loading");
      expect(within(dialog).getByText("Загружается видео")).toBeInTheDocument();
      expect(within(dialog).queryByLabelText("Громкость")).not.toBeInTheDocument();
      expect(dialog.querySelector(".person-media-stage-video-time")).toBeNull();

      let pausedState = true;
      let readyState = 0;
      Object.defineProperty(video as HTMLVideoElement, "paused", {
        configurable: true,
        get: () => pausedState,
      });
      Object.defineProperty(video as HTMLVideoElement, "ended", {
        configurable: true,
        get: () => false,
      });
      Object.defineProperty(video as HTMLVideoElement, "readyState", {
        configurable: true,
        get: () => readyState,
      });

      readyState = 1;
      fireEvent.loadedMetadata(video as HTMLVideoElement);
      expect(stage).toHaveAttribute("data-stage-state", "ready");
      expect(within(dialog).queryByText("Загружается видео")).not.toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Смотреть видео" })).toBeInTheDocument();

      pausedState = false;
      fireEvent.play(video as HTMLVideoElement);
      expect(stage).toHaveAttribute("data-stage-state", "playing");
      expect(within(dialog).queryByRole("button", { name: "Смотреть видео" })).not.toBeInTheDocument();
    } finally {
      if (originalInnerWidthDescriptor) {
        Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
      }
    }
  });

  it("uses the dedicated phone video mode on Chrome Android while preserving the cautious startup path", async () => {
    const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
    const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");

    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    try {
      render(
        <PersonMediaGallery
          media={[
            createMediaAsset({
              id: "media-video",
              kind: "video",
              title: "Архивное видео",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/media-video/video.mp4"
            })
          ]}
          showStage={false}
          showStickyFooter={false}
          lightboxOnly
          openLightboxOnMount
          initialActiveMediaId="media-video"
          lightboxAriaLabelPrefix="Просмотр архива"
        />
      );

      const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
      const video = dialog.querySelector("video.person-media-stage-video") as HTMLVideoElement | null;
      expect(dialog).toHaveClass("media-lightbox-phone-video-mode");
      expect(video).not.toBeNull();
      expect(video).toHaveAttribute("src", "/api/media/media-video?source=person-media-lightbox-video");
      expect(video?.hasAttribute("controls")).toBe(false);
      expect(video?.autoplay).toBe(false);
      expect(video?.preload).toBe("metadata");
      expect(dialog.querySelector(".media-lightbox-player-stage")).toBeNull();
      expect(dialog.querySelector(".person-media-stage-video-top-actions")).not.toBeNull();
      expect(within(dialog).queryByRole("button", { name: "Загрузить видео" })).toBeNull();
      let readyState = 0;
      Object.defineProperty(video as HTMLVideoElement, "readyState", {
        configurable: true,
        get: () => readyState,
      });
      Object.defineProperty(video as HTMLVideoElement, "paused", {
        configurable: true,
        get: () => true,
      });
      Object.defineProperty(video as HTMLVideoElement, "ended", {
        configurable: true,
        get: () => false,
      });
      readyState = 1;
      fireEvent.loadedMetadata(video as HTMLVideoElement);
      expect(within(dialog).getByRole("button", { name: "Смотреть видео" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Воспроизвести видео" })).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Позиция видео")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Выключить звук" })).toBeInTheDocument();
      expect(within(dialog).queryByLabelText("Громкость")).not.toBeInTheDocument();
    } finally {
      if (originalUserAgentDescriptor) {
        Object.defineProperty(window.navigator, "userAgent", originalUserAgentDescriptor);
      } else {
        Object.defineProperty(window.navigator, "userAgent", {
          configurable: true,
          get: () => "",
        });
      }

      if (originalInnerWidthDescriptor) {
        Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
      }
    }
  });

  it("uses native iPhone video fullscreen on phone-sized Safari when available", async () => {
    const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
    const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const webkitEnterFullscreen = vi.fn();

    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "webkitEnterFullscreen", {
      configurable: true,
      value: webkitEnterFullscreen,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "webkitSupportsFullscreen", {
      configurable: true,
      get: () => true,
    });

    try {
      render(
        <PersonMediaGallery
          media={[
            createMediaAsset({
              id: "media-video",
              kind: "video",
              title: "Архивное видео",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/media-video/video.mp4"
            })
          ]}
          showStage={false}
          showStickyFooter={false}
          lightboxOnly
          openLightboxOnMount
          initialActiveMediaId="media-video"
          lightboxAriaLabelPrefix="Просмотр архива"
        />
      );

      const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });

      await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: "Открыть в полноэкранном режиме" }));
      });

      expect(webkitEnterFullscreen).toHaveBeenCalledTimes(1);
      expect(requestFullscreen).not.toHaveBeenCalled();
    } finally {
      if (originalUserAgentDescriptor) {
        Object.defineProperty(window.navigator, "userAgent", originalUserAgentDescriptor);
      } else {
        Object.defineProperty(window.navigator, "userAgent", {
          configurable: true,
          get: () => "",
        });
      }

      if (originalInnerWidthDescriptor) {
        Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
      }
    }
  });

  it("hides phone video chrome by removing nav and strip from the DOM, then restores them on tap", () => {
    vi.useFakeTimers();

    const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    try {
      render(
        <PersonMediaGallery
          media={[
            createMediaAsset({
              id: "media-video",
              kind: "video",
              title: "Архивное видео",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/media-video/video.mp4"
            }),
            createMediaAsset({
              id: "media-video-2",
              kind: "video",
              title: "Второе архивное видео",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/media-video-2/video.mp4"
            })
          ]}
          showStage={false}
          showStickyFooter={false}
          lightboxOnly
          openLightboxOnMount
          initialActiveMediaId="media-video"
          lightboxAriaLabelPrefix="Просмотр архива"
        />
      );

      const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
      const video = dialog.querySelector("video.person-media-stage-video") as HTMLVideoElement | null;
      expect(video).not.toBeNull();
      expect(dialog.querySelector(".person-media-stage-video-controls-anchor-phone")).not.toBeNull();
      expect(dialog.querySelectorAll(".person-media-stage-video-nav")).toHaveLength(2);
      expect(dialog.querySelector(".media-lightbox-phone-video-strip")).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(2400);
      });

      expect(dialog).toHaveClass("media-lightbox-video-chrome-hidden");
      expect(dialog.querySelector(".person-media-stage-video-controls-anchor-phone")).toBeNull();
      expect(dialog.querySelector(".media-lightbox-phone-video-strip")).toBeNull();
      expect(dialog.querySelector(".person-media-stage-video-nav")).toBeNull();

      fireEvent.click(video as HTMLVideoElement);
      expect(dialog).not.toHaveClass("media-lightbox-video-chrome-hidden");
      expect(dialog.querySelector(".person-media-stage-video-controls-anchor-phone")).not.toBeNull();
      expect(dialog.querySelectorAll(".person-media-stage-video-nav")).toHaveLength(2);
      expect(dialog.querySelector(".media-lightbox-phone-video-strip")).not.toBeNull();

      fireEvent.click(video as HTMLVideoElement);
      expect(dialog).toHaveClass("media-lightbox-video-chrome-hidden");
      expect(dialog.querySelector(".person-media-stage-video-controls-anchor-phone")).toBeNull();
      expect(dialog.querySelector(".media-lightbox-phone-video-strip")).toBeNull();
    } finally {
      if (originalInnerWidthDescriptor) {
        Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
      }
    }
  });

  it("keeps the inline stage video on Chrome Android in custom-controls mode without native UI", () => {
    const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
    });

    try {
      render(
        <PersonMediaGallery
          media={[
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

      const stageVideo = document.querySelector("video.person-media-stage-video-inline") as HTMLVideoElement | null;
      expect(stageVideo).not.toBeNull();
      expect(stageVideo?.hasAttribute("controls")).toBe(false);
      expect(stageVideo?.preload).toBe("metadata");
      expect(screen.getByRole("button", { name: "Воспроизвести видео" })).toBeInTheDocument();
      expect(screen.getByLabelText("Позиция видео")).toBeInTheDocument();
      expect(screen.getByLabelText("Громкость")).toBeInTheDocument();
    } finally {
      if (originalUserAgentDescriptor) {
        Object.defineProperty(window.navigator, "userAgent", originalUserAgentDescriptor);
      } else {
        Object.defineProperty(window.navigator, "userAgent", {
          configurable: true,
          get: () => "",
        });
      }
    }
  });

  it("does not fall back immediately on the first Chrome Android video error", () => {
    vi.useFakeTimers();

    const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
    const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    try {
      render(
        <PersonMediaGallery
          media={[
            createMediaAsset({
              id: "media-video",
              kind: "video",
              title: "Архивное видео",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/media-video/video.mp4"
            })
          ]}
          showStage={false}
          showStickyFooter={false}
          lightboxOnly
          openLightboxOnMount
          initialActiveMediaId="media-video"
          lightboxAriaLabelPrefix="Просмотр архива"
        />
      );

      const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
      const video = dialog.querySelector("video.person-media-stage-video") as HTMLVideoElement;

      fireEvent.error(video);

      expect(screen.queryByText("Файл временно недоступен")).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(12_000);
      });

      expect(screen.getByText("Файл временно недоступен")).toBeInTheDocument();
    } finally {
      if (originalUserAgentDescriptor) {
        Object.defineProperty(window.navigator, "userAgent", originalUserAgentDescriptor);
      } else {
        Object.defineProperty(window.navigator, "userAgent", {
          configurable: true,
          get: () => "",
        });
      }

      if (originalInnerWidthDescriptor) {
        Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
      }
    }
  });

  it("keeps the Chrome Android lightbox player visible after an error if metadata already loaded", () => {
    vi.useFakeTimers();

    const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
    const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    try {
      render(
        <PersonMediaGallery
          media={[
            createMediaAsset({
              id: "media-video",
              kind: "video",
              title: "Архивное видео",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/media-video/video.mp4"
            })
          ]}
          showStage={false}
          showStickyFooter={false}
          lightboxOnly
          openLightboxOnMount
          initialActiveMediaId="media-video"
          lightboxAriaLabelPrefix="Просмотр архива"
        />
      );

      const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
      const video = dialog.querySelector("video.person-media-stage-video") as HTMLVideoElement;

      fireEvent.loadedMetadata(video);
      fireEvent.error(video);

      act(() => {
        vi.advanceTimersByTime(15_000);
      });

      const currentDialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
      expect(currentDialog.querySelector("video.person-media-stage-video")).not.toBeNull();
      expect(currentDialog.querySelector(".person-media-stage-video-shell-phone")).not.toBeNull();
      fireEvent.click(currentDialog.querySelector("video.person-media-stage-video") as HTMLVideoElement);
      expect(within(currentDialog).getByLabelText("Позиция видео")).toBeInTheDocument();
      expect(screen.queryByText("Файл временно недоступен")).not.toBeInTheDocument();
    } finally {
      if (originalUserAgentDescriptor) {
        Object.defineProperty(window.navigator, "userAgent", originalUserAgentDescriptor);
      } else {
        Object.defineProperty(window.navigator, "userAgent", {
          configurable: true,
          get: () => "",
        });
      }

      if (originalInnerWidthDescriptor) {
        Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
      }
    }
  });

  it("can keep archive-style lightbox video in manual-start mode when autoplay is disabled explicitly", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());

    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-video",
            kind: "video",
            title: "Архивное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video/video.mp4"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
        lightboxOnly
        openLightboxOnMount
        initialActiveMediaId="media-video"
        lightboxAriaLabelPrefix="Просмотр архива"
        autoPlayLightboxVideo={false}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
    const video = dialog.querySelector("video.person-media-stage-video") as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    expect(video?.autoplay).toBe(false);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("pauses the current lightbox video before moving to the next media", () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-video-1",
            kind: "video",
            title: "Архивное видео 1",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video-1/video.mp4"
          }),
          createMediaAsset({
            id: "media-video-2",
            kind: "video",
            title: "Архивное видео 2",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video-2/video.mp4"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
        lightboxOnly
        openLightboxOnMount
        initialActiveMediaId="media-video-1"
        lightboxAriaLabelPrefix="Просмотр архива"
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео 1" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Следующее медиа" }));

    expect(pauseSpy).toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео 2" })).toBeInTheDocument();
  });

  it("keeps phone-mode video navigation in a clear play-ready state and uses real preview thumbs", () => {
    const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    try {
      render(
        <PersonMediaGallery
          media={[
            createMediaAsset({
              id: "media-video-1",
              kind: "video",
              title: "Архивное видео 1",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/media-video-1/video.mp4"
            }),
            createMediaAsset({
              id: "media-video-2",
              kind: "video",
              title: "Архивное видео 2",
              mime_type: "video/mp4",
              storage_path: "trees/tree-1/media/video/media-video-2/video.mp4"
            })
          ]}
          showStage={false}
          showStickyFooter={false}
          lightboxOnly
          openLightboxOnMount
          initialActiveMediaId="media-video-1"
          lightboxAriaLabelPrefix="Просмотр архива"
        />
      );

      const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео 1" });
      const thumbVideos = dialog.querySelectorAll(".media-lightbox-phone-video-strip video.person-media-thumb-video");
      expect(thumbVideos).toHaveLength(2);
      expect(thumbVideos[0]).toHaveAttribute("src", "/api/media/media-video-1?source=person-media-thumb-video");
      expect(thumbVideos[1]).toHaveAttribute("src", "/api/media/media-video-2?source=person-media-thumb-video");

      const firstVideo = dialog.querySelector("video.person-media-stage-video") as HTMLVideoElement;
      let firstReadyState = 0;
      Object.defineProperty(firstVideo, "readyState", {
        configurable: true,
        get: () => firstReadyState,
      });
      Object.defineProperty(firstVideo, "paused", {
        configurable: true,
        get: () => true,
      });
      Object.defineProperty(firstVideo, "ended", {
        configurable: true,
        get: () => false,
      });
      firstReadyState = 1;
      fireEvent.loadedMetadata(firstVideo);
      expect(within(dialog).getByRole("button", { name: "Смотреть видео" })).toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole("button", { name: "Следующее медиа" }));

      const nextDialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео 2" });
      const nextVideo = nextDialog.querySelector("video.person-media-stage-video") as HTMLVideoElement;
      let nextReadyState = 0;
      Object.defineProperty(nextVideo, "readyState", {
        configurable: true,
        get: () => nextReadyState,
      });
      Object.defineProperty(nextVideo, "paused", {
        configurable: true,
        get: () => true,
      });
      Object.defineProperty(nextVideo, "ended", {
        configurable: true,
        get: () => false,
      });
      nextReadyState = 1;
      fireEvent.loadedMetadata(nextVideo);

      expect(nextDialog).toHaveClass("media-lightbox-phone-video-mode");
      expect(within(nextDialog).getByRole("button", { name: "Смотреть видео" })).toBeInTheDocument();
      expect(within(nextDialog).queryByText("Загружается видео")).not.toBeInTheDocument();
    } finally {
      if (originalInnerWidthDescriptor) {
        Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
      }
    }
  });

  it("seeks lightbox video through the custom progress slider", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-video",
            kind: "video",
            title: "Архивное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video/video.mp4"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
        lightboxOnly
        openLightboxOnMount
        initialActiveMediaId="media-video"
        lightboxAriaLabelPrefix="Просмотр архива"
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });
    const video = dialog.querySelector("video.person-media-stage-video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 15,
    });
    let currentTimeValue = 0;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => currentTimeValue,
      set: (value: number) => {
        currentTimeValue = value;
      },
    });
    fireEvent.loadedMetadata(video);

    const seekSlider = within(dialog).getByLabelText("Позиция видео") as HTMLInputElement;
    fireEvent.change(seekSlider, { target: { value: "5" } });

    expect(video.currentTime).toBe(5);
  });

  it("does not pause the lightbox video when fullscreen mode re-renders the viewer shell", async () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: vi.fn(function (this: Element) {
        fullscreenElement = this;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      }),
    });

    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-video",
            kind: "video",
            title: "Архивное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video/video.mp4"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
        lightboxOnly
        openLightboxOnMount
        initialActiveMediaId="media-video"
        lightboxAriaLabelPrefix="Просмотр архива"
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Открыть в полноэкранном режиме" }));
    });

    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it("fullscreens the shared lightbox container and keeps controls available in fullscreen", async () => {
    vi.useFakeTimers();

    let fullscreenElement: Element | null = null;
    const requestFullscreen = vi.fn(function (this: Element) {
      fullscreenElement = this;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });
    const exitFullscreen = vi.fn(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });

    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-video",
            kind: "video",
            title: "Архивное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video/video.mp4"
          }),
          createMediaAsset({
            id: "media-video-2",
            kind: "video",
            title: "Второе архивное видео",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video-2/video.mp4"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
        lightboxOnly
        openLightboxOnMount
        initialActiveMediaId="media-video"
        lightboxAriaLabelPrefix="Просмотр архива"
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Просмотр архива: Архивное видео" });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Открыть в полноэкранном режиме" }));
    });

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(fullscreenElement).toBe(dialog);
    expect(dialog).toHaveClass("media-lightbox-fullscreen");
    expect(within(dialog).getByRole("button", { name: "Закрыть просмотр" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Предыдущее медиа" })).toBeInTheDocument();
    expect(dialog.querySelector(".media-lightbox-strip-fixed")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(2400);
    });

    expect(dialog).toHaveClass("media-lightbox-fullscreen-idle");

    fireEvent.mouseMove(dialog);
    expect(dialog).not.toHaveClass("media-lightbox-fullscreen-idle");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Выйти из полноэкранного режима" }));
    });

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("keeps fullscreen controls visible while the user interacts with the strip", async () => {
    vi.useFakeTimers();

    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn(() => {
        fullscreenElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      }),
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: vi.fn(function (this: Element) {
        fullscreenElement = this;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      }),
    });

    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
        lightboxOnly
        openLightboxOnMount
        initialActiveMediaId="media-photo-1"
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Открыть в полноэкранном режиме" }));
    });

    const strip = dialog.querySelector(".media-lightbox-strip-fixed") as HTMLElement | null;
    expect(strip).not.toBeNull();

    fireEvent.mouseEnter(strip as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(dialog).not.toHaveClass("media-lightbox-fullscreen-idle");

    fireEvent.mouseLeave(strip as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(dialog).toHaveClass("media-lightbox-fullscreen-idle");
  });

  it("keeps the fullscreen viewer mounted during exit transition and unmounts it after the delay", () => {
    vi.useFakeTimers();

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

    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Семейное фото" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть просмотр" }));

    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Семейное фото" })).toHaveClass("media-lightbox-closing");

    act(() => {
      vi.advanceTimersByTime(179);
    });
    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Семейное фото" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("dialog", { name: "Просмотр медиа: Семейное фото" })).not.toBeInTheDocument();
  });

  it("switches to the next media on fullscreen swipe left", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" });
    swipeElement(dialog, { startX: 240, startY: 180, endX: 120, endY: 190 });

    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 2" })).toBeInTheDocument();
  });

  it("switches to the previous media on fullscreen swipe right", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Фото 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 2" });
    swipeElement(dialog, { startX: 120, startY: 180, endX: 240, endY: 188 });

    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" })).toBeInTheDocument();
  });

  it("starts closing transition on fullscreen swipe down", () => {
    vi.useFakeTimers();

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

    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Семейное фото" });
    swipeElement(dialog, { startX: 180, startY: 120, endX: 188, endY: 244 });

    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Семейное фото" })).toHaveClass("media-lightbox-closing");

    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(screen.queryByRole("dialog", { name: "Просмотр медиа: Семейное фото" })).not.toBeInTheDocument();
  });

  it("does not trigger swipe actions on small touch movement", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" });
    swipeElement(dialog, { startX: 180, startY: 160, endX: 202, endY: 172 });

    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" })).toBeInTheDocument();
  });

  it("fails soft on swipe and button navigation at the lightbox edges", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const firstDialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" });
    const previousButton = within(firstDialog).getByRole("button", { name: "Предыдущее медиа" });
    expect(previousButton).toBeDisabled();

    swipeElement(firstDialog, { startX: 120, startY: 180, endX: 244, endY: 188 });
    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" })).toBeInTheDocument();

    fireEvent.click(previousButton);
    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" })).toBeInTheDocument();

    fireEvent.click(within(firstDialog).getByRole("button", { name: "Следующее медиа" }));

    const lastDialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 2" });
    const nextButton = within(lastDialog).getByRole("button", { name: "Следующее медиа" });
    expect(nextButton).toBeDisabled();

    swipeElement(lastDialog, { startX: 244, startY: 180, endX: 120, endY: 188 });
    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 2" })).toBeInTheDocument();

    fireEvent.click(nextButton);
    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 2" })).toBeInTheDocument();
  });

  it("ignores swipe navigation when touch starts on the strip or controls", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-3",
            title: "Фото 3",
            storage_path: "trees/tree-1/media/photo/media-photo-3/photo.jpg"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Фото 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 2" });
    const strip = dialog.querySelector(".media-lightbox-strip-fixed");
    expect(strip).not.toBeNull();

    swipeElement(strip as Element, { startX: 240, startY: 180, endX: 120, endY: 188 });
    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 2" })).toBeInTheDocument();

    const nextButton = within(dialog).getByRole("button", { name: "Следующее медиа" });
    swipeElement(nextButton, { startX: 240, startY: 180, endX: 120, endY: 188 });
    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 2" })).toBeInTheDocument();
  });

  it("smoothly scrolls the fullscreen strip to center a right-edge thumbnail on click", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-3",
            title: "Фото 3",
            storage_path: "trees/tree-1/media/photo/media-photo-3/photo.jpg"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Фото 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 2" });
    const strip = dialog.querySelector(".media-lightbox-strip-fixed");
    expect(strip).not.toBeNull();

    const scrollTo = mockHorizontalScrollContainer(strip as HTMLDivElement, {
      clientWidth: 300,
      scrollWidth: 1000,
      scrollLeft: 220
    });

    const firstThumb = within(dialog).getByRole("button", { name: "Показать медиа 1: Фото 1" });
    const secondThumb = within(dialog).getByRole("button", { name: "Показать медиа 2: Фото 2" });
    const thirdThumb = within(dialog).getByRole("button", { name: "Показать медиа 3: Фото 3" });
    mockScrollableThumb(firstThumb, strip as HTMLDivElement, { contentLeft: 0, width: 80, height: 56 });
    mockScrollableThumb(secondThumb, strip as HTMLDivElement, { contentLeft: 140, width: 80, height: 56 });
    mockScrollableThumb(thirdThumb, strip as HTMLDivElement, { contentLeft: 450, width: 80, height: 56 });

    fireEvent.click(thirdThumb);

    expect(scrollTo).toHaveBeenCalledWith({ left: 340, behavior: "smooth" });
  });

  it("keeps the fullscreen strip centered during repeated left-right navigation", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-3",
            title: "Фото 3",
            storage_path: "trees/tree-1/media/photo/media-photo-3/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-4",
            title: "Фото 4",
            storage_path: "trees/tree-1/media/photo/media-photo-4/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-5",
            title: "Фото 5",
            storage_path: "trees/tree-1/media/photo/media-photo-5/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-6",
            title: "Фото 6",
            storage_path: "trees/tree-1/media/photo/media-photo-6/photo.jpg"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" });
    const strip = dialog.querySelector(".media-lightbox-strip-fixed");
    expect(strip).not.toBeNull();

    const scrollTo = mockHorizontalScrollContainer(strip as HTMLDivElement, {
      clientWidth: 300,
      scrollWidth: 1200,
      scrollLeft: 0
    });

    const thumbButtons = [
      within(dialog).getByRole("button", { name: "Показать медиа 1: Фото 1" }),
      within(dialog).getByRole("button", { name: "Показать медиа 2: Фото 2" }),
      within(dialog).getByRole("button", { name: "Показать медиа 3: Фото 3" }),
      within(dialog).getByRole("button", { name: "Показать медиа 4: Фото 4" }),
      within(dialog).getByRole("button", { name: "Показать медиа 5: Фото 5" }),
      within(dialog).getByRole("button", { name: "Показать медиа 6: Фото 6" })
    ];

    thumbButtons.forEach((thumb, index) => {
      mockScrollableThumb(thumb, strip as HTMLDivElement, { contentLeft: index * 96, width: 80, height: 56 });
    });

    for (let step = 0; step < 10; step += 1) {
      const currentDialog = screen.getByRole("dialog", { name: /Просмотр медиа:/ });
      fireEvent.click(within(currentDialog).getByRole("button", { name: "Следующее медиа" }));
    }

    for (let step = 0; step < 2; step += 1) {
      const currentDialog = screen.getByRole("dialog", { name: /Просмотр медиа:/ });
      fireEvent.click(within(currentDialog).getByRole("button", { name: "Предыдущее медиа" }));
    }

    const finalDialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 4" });
    const finalStrip = finalDialog.querySelector(".media-lightbox-strip-fixed");
    expect(finalStrip).not.toBeNull();

    const activeThumb = within(finalDialog).getByRole("button", { name: "Показать медиа 4: Фото 4" });
    const activeRect = activeThumb.getBoundingClientRect();
    const stripRect = (finalStrip as HTMLDivElement).getBoundingClientRect();
    const activeCenter = activeRect.left + activeRect.width / 2;
    const stripCenter = stripRect.left + stripRect.width / 2;

    expect(activeThumb).toHaveAttribute("aria-pressed", "true");
    expect(Math.abs(activeCenter - stripCenter)).toBeLessThanOrEqual(LIGHTBOX_STRIP_CENTER_THRESHOLD_PX);
    expect(scrollTo.mock.calls.length).toBeGreaterThan(0);
    expect(scrollTo.mock.calls.every(([options]) => options.behavior === "smooth")).toBe(true);
  });

  it("does not scroll when clicking a thumbnail that is already close enough to strip center", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-3",
            title: "Фото 3",
            storage_path: "trees/tree-1/media/photo/media-photo-3/photo.jpg"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" });
    const strip = dialog.querySelector(".media-lightbox-strip-fixed");
    expect(strip).not.toBeNull();

    const scrollTo = mockHorizontalScrollContainer(strip as HTMLDivElement, {
      clientWidth: 300,
      scrollWidth: 1000,
      scrollLeft: 40
    });

    const firstThumb = within(dialog).getByRole("button", { name: "Показать медиа 1: Фото 1" });
    const secondThumb = within(dialog).getByRole("button", { name: "Показать медиа 2: Фото 2" });
    const thirdThumb = within(dialog).getByRole("button", { name: "Показать медиа 3: Фото 3" });
    mockScrollableThumb(firstThumb, strip as HTMLDivElement, { contentLeft: 0, width: 80, height: 56 });
    mockScrollableThumb(secondThumb, strip as HTMLDivElement, { contentLeft: 150, width: 80, height: 56 });
    mockScrollableThumb(thirdThumb, strip as HTMLDivElement, { contentLeft: 300, width: 80, height: 56 });

    fireEvent.click(secondThumb);

    expect(scrollTo).not.toHaveBeenCalled();
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

    expect(screen.getAllByText("Аватар").length).toBeGreaterThan(0);
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

  it("keeps the add tile inside the same media grid when the gallery is empty", () => {
    render(
      <PersonMediaGallery
        media={[]}
        emptyTitle="Видео пока нет"
        emptyMessage="Когда ролики появятся, они будут собраны здесь."
        appendTile={<button type="button">Добавить видео</button>}
      />
    );

    const grid = document.querySelector(".person-media-thumb-strip.person-media-thumb-strip-empty");
    expect(grid).not.toBeNull();
    expect(within(grid as HTMLElement).getByRole("button", { name: "Добавить видео" })).toBeInTheDocument();
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

  it("allows setting the active photo as avatar from the fullscreen viewer when stage preview is disabled", async () => {
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
        showStage={false}
        showStickyFooter={false}
        showViewerAvatarAction
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 1: Семейное фото" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Сделать фото профиля" }));
    });

    expect(onSetAvatar).toHaveBeenCalledWith("media-photo");
  });

  it("keeps the current-avatar state as the same capsule control in the fullscreen viewer", () => {
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
        avatarMediaId="media-photo"
        onSetAvatar={vi.fn()}
        showStage={false}
        showStickyFooter={false}
        showViewerAvatarAction
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 1: Семейное фото" }));

    expect(screen.getByRole("button", { name: "Текущее фото профиля" })).toBeDisabled();
  });

  it("keeps delete controls out of read-only lightbox usage by default", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo",
            title: "Семейное фото",
            storage_path: "trees/tree-1/media/photo/media-photo/photo.jpg"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 1: Семейное фото" }));

    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Семейное фото" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить фото" })).not.toBeInTheDocument();
  });

  it("renders a limited preview-entry strip and keeps the lightbox as the full gallery flow", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          }),
          createMediaAsset({
            id: "media-video-3",
            kind: "video",
            mime_type: "video/mp4",
            title: "Видео 3",
            storage_path: "trees/tree-1/media/video/media-video-3/video.mp4"
          }),
          createMediaAsset({
            id: "media-photo-4",
            title: "Фото 4",
            storage_path: "trees/tree-1/media/photo/media-photo-4/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-5",
            title: "Фото 5",
            storage_path: "trees/tree-1/media/photo/media-photo-5/photo.jpg"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
        compactPreviewEntry
        previewStripLimit={3}
      />
    );

    expect(screen.getByText("Галерея")).toBeInTheDocument();
    expect(screen.getByText("Фото и видео • 5 материалов")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Показать медиа 1: Фото 1" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Показать медиа 2: Фото 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Показать медиа 3: Видео 3" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Показать медиа 4: Фото 4" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Открыть галерею и показать ещё 2/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Фото 2" }));

    const dialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 2" });
    expect(within(dialog).getByRole("button", { name: "Следующее медиа" })).toBeInTheDocument();
    expect(dialog.querySelectorAll(".media-lightbox-strip-fixed .person-media-thumb")).toHaveLength(5);
  });

  it("opens the preview-entry overflow tile at the first hidden media item", () => {
    render(
      <PersonMediaGallery
        media={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-3",
            title: "Фото 3",
            storage_path: "trees/tree-1/media/photo/media-photo-3/photo.jpg"
          }),
          createMediaAsset({
            id: "media-video-4",
            kind: "video",
            mime_type: "video/mp4",
            title: "Видео 4",
            storage_path: "trees/tree-1/media/video/media-video-4/video.mp4"
          })
        ]}
        showStage={false}
        showStickyFooter={false}
        compactPreviewEntry
        previewStripLimit={3}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Открыть галерею и показать ещё 1/i }));

    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Видео 4" })).toBeInTheDocument();
  });

  it("renders the per-card actions menu only when explicit builder action props are passed", () => {
    const media = [
      createMediaAsset({
        id: "media-photo-1",
        title: "Фото 1",
        storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
      }),
      createMediaAsset({
        id: "media-photo-2",
        title: "Фото 2",
        storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
      })
    ];

    const { rerender } = render(
      <PersonMediaGallery media={media} showStage={false} showStickyFooter={false} />
    );

    expect(screen.queryByRole("checkbox", { name: "Выбрать медиа 1: Фото 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Открыть действия для «Фото 1»" })).not.toBeInTheDocument();

    rerender(
      <PersonMediaGallery
        media={media}
        showStage={false}
        showStickyFooter={false}
        showInlineMediaActions
        getInlineMediaAlbumHref={() => "/tree/demo-tree/media?mode=photo&view=albums"}
      />
    );

    expect(screen.getByRole("button", { name: "Открыть действия для «Фото 1»" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Выбрать медиа 1: Фото 1" })).not.toBeInTheDocument();
  });

  it("filters per-card menu actions by explicit manage capability", async () => {
    const media = [
      createMediaAsset({
        id: "media-photo-1",
        title: "Фото 1",
        storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
      })
    ];

    const { unmount } = render(
      <PersonMediaGallery
        media={media}
        showStage={false}
        showStickyFooter={false}
        showInlineMediaActions
        getInlineMediaAlbumHref={() => "/tree/demo-tree/media?mode=photo&view=albums"}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Фото 1»" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Скачать" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Перейти к альбому" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Выбрать несколько" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить" })).not.toBeInTheDocument();

    unmount();

    render(
      <PersonMediaGallery
        media={media}
        showStage={false}
        showStickyFooter={false}
        showInlineMediaActions
        canManageInlineMediaActions
        getInlineMediaAlbumHref={() => "/tree/demo-tree/media?mode=photo&view=albums"}
        canSelectMedia
        onStartMediaSelection={vi.fn()}
        canDeleteMedia
        onDeleteMedia={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Фото 1»" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Выбрать несколько" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
  });

  it("renders selection checkboxes only when selection mode is explicitly active", () => {
    const media = [
      createMediaAsset({
        id: "media-photo-1",
        title: "Фото 1",
        storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
      }),
      createMediaAsset({
        id: "media-photo-2",
        title: "Фото 2",
        storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
      })
    ];

    const { rerender } = render(
      <PersonMediaGallery
        media={media}
        showStage={false}
        showStickyFooter={false}
        canSelectMedia
        selectedMediaIds={new Set(["media-photo-1"])}
        onToggleMediaSelection={vi.fn()}
      />
    );

    expect(screen.queryByRole("checkbox", { name: "Выбрать медиа 1: Фото 1" })).not.toBeInTheDocument();

    rerender(
      <PersonMediaGallery
        media={media}
        showStage={false}
        showStickyFooter={false}
        selectionMode
        canSelectMedia
        selectedMediaIds={new Set(["media-photo-1"])}
        onToggleMediaSelection={vi.fn()}
      />
    );

    expect(screen.getByRole("checkbox", { name: "Выбрать медиа 1: Фото 1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Выбрать медиа 2: Фото 2" })).not.toBeChecked();
  });

  it("enters selection mode from the per-card menu and then toggles selection without opening the lightbox", () => {
    render(
      <StatefulSelectableGallery
        initialMedia={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Открыть действия для «Фото 1»" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько" }));

    expect(screen.getByRole("checkbox", { name: "Выбрать медиа 1: Фото 1" })).toBeChecked();
    expect(screen.queryByRole("dialog", { name: "Просмотр медиа: Фото 1" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Фото 2" }));

    expect(screen.getByRole("checkbox", { name: "Выбрать медиа 2: Фото 2" })).toBeChecked();
    expect(screen.queryByRole("dialog", { name: "Просмотр медиа: Фото 1" })).not.toBeInTheDocument();
  });

  it("deletes the current builder photo from the lightbox and moves to the next photo when it exists", async () => {
    const onDelete = vi.fn(async () => undefined);

    render(
      <StatefulDeleteGallery
        initialMedia={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-3",
            title: "Фото 3",
            storage_path: "trees/tree-1/media/photo/media-photo-3/photo.jpg"
          })
        ]}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Фото 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить фото" }));

    expect(screen.getByRole("dialog", { name: "Удалить это фото?" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    });

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("media-photo-2");
    });
    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 3" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Удалить это фото?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Показать медиа 2: Фото 2" })).not.toBeInTheDocument();
  });

  it("moves to the previous photo when the last opened builder photo is deleted", async () => {
    const onDelete = vi.fn(async () => undefined);

    render(
      <StatefulDeleteGallery
        initialMedia={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          }),
          createMediaAsset({
            id: "media-photo-2",
            title: "Фото 2",
            storage_path: "trees/tree-1/media/photo/media-photo-2/photo.jpg"
          })
        ]}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 2: Фото 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить фото" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    });

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("media-photo-2");
    });
    expect(screen.getByRole("dialog", { name: "Просмотр медиа: Фото 1" })).toBeInTheDocument();
  });

  it("closes the builder lightbox after deleting the last remaining photo", async () => {
    const onDelete = vi.fn(async () => undefined);

    render(
      <StatefulDeleteGallery
        initialMedia={[
          createMediaAsset({
            id: "media-photo-1",
            title: "Фото 1",
            storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg"
          })
        ]}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать медиа 1: Фото 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить фото" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    });

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("media-photo-1");
    });
    expect(screen.queryByRole("dialog", { name: "Просмотр медиа: Фото 1" })).not.toBeInTheDocument();
    expect(screen.getByText("Для этого человека пока не добавлено медиа.")).toBeInTheDocument();
  });
});
