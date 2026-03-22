import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
    created_by: "user-1",
    created_at: "2026-03-07T00:00:00.000Z",
    ...overrides
  };
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

describe("person media gallery", () => {
  afterEach(() => {
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
    expect(screen.getByText("Семейное видео")).toBeInTheDocument();
    expect(document.querySelector(".person-media-thumb-video-placeholder")).not.toBeNull();

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
    expect(dialog.querySelector("video.person-media-stage-video")).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Закрыть просмотр" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Закрыть просмотр" })).toHaveLength(1);
    expect(dialog.querySelector(".media-lightbox-strip-fixed .person-media-thumb-video-placeholder")).not.toBeNull();

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

    const nextButton = within(dialog).getByRole("button", { name: "Следующее медиа" });
    const previousButton = within(dialog).getByRole("button", { name: "Предыдущее медиа" });

    for (let step = 0; step < 10; step += 1) {
      fireEvent.click(nextButton);
    }

    for (let step = 0; step < 5; step += 1) {
      fireEvent.click(previousButton);
    }

    const finalDialog = screen.getByRole("dialog", { name: "Просмотр медиа: Фото 6" });
    const finalStrip = finalDialog.querySelector(".media-lightbox-strip-fixed");
    expect(finalStrip).not.toBeNull();

    const activeThumb = within(finalDialog).getByRole("button", { name: "Показать медиа 6: Фото 6" });
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
