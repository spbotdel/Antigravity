import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadFileWithTransportContract } = vi.hoisted(() => ({
  uploadFileWithTransportContract: vi.fn(async () => undefined),
}));

import { BuilderWorkspace } from "@/components/tree/builder-workspace";
import type { TreeSnapshot } from "@/lib/types";

vi.mock("@/components/tree/family-tree-canvas", () => ({
  FamilyTreeCanvas: () => <div data-testid="family-tree-canvas" />,
}));

vi.mock("@/components/tree/person-media-gallery", () => ({
  PersonMediaGallery: () => <div data-testid="person-media-gallery" />,
}));

vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    uploadFileWithTransportContract,
  };
});

function createSnapshot(): TreeSnapshot {
  return {
    tree: {
      id: "tree-1",
      owner_user_id: "user-1",
      slug: "demo-tree",
      title: "Demo Tree",
      description: null,
      visibility: "private",
      root_person_id: "person-1",
      created_at: "2026-03-09T00:00:00.000Z",
      updated_at: "2026-03-09T00:00:00.000Z",
    },
    actor: {
      userId: "user-1",
      role: "owner",
      isAuthenticated: true,
      accessSource: "membership",
      shareLinkId: null,
      canEdit: true,
      canManageMembers: true,
      canManageSettings: true,
      canReadAudit: true,
    },
    people: [
      {
        id: "person-1",
        tree_id: "tree-1",
        full_name: "Demo Person",
        gender: "male",
        birth_date: "1990-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
    ],
    parentLinks: [],
    partnerships: [],
    media: [
      {
        id: "media-1",
        tree_id: "tree-1",
        kind: "document",
        provider: "object_storage",
        visibility: "members",
        storage_path: "trees/tree-1/media/document/media-1/file.pdf",
        external_url: null,
        title: "Demo Document",
        caption: null,
        mime_type: "application/pdf",
        size_bytes: 1024,
        created_by: null,
        created_at: "2026-03-09T00:00:00.000Z",
      },
    ],
    personMedia: [
      {
        id: "person-media-1",
        person_id: "person-1",
        media_id: "media-1",
        is_primary: false,
      },
    ],
  };
}

function createSnapshotWithPhoto(): TreeSnapshot {
  const snapshot = createSnapshot();
  snapshot.media = [
    {
      id: "media-photo-1",
      tree_id: "tree-1",
      kind: "photo",
      provider: "object_storage",
      visibility: "members",
      storage_path: "trees/tree-1/media/photo/media-photo-1/photo.jpg",
      external_url: null,
      title: "Demo Photo",
      caption: null,
      mime_type: "image/jpeg",
      size_bytes: 1024,
      created_by: null,
      created_at: "2026-03-09T00:00:00.000Z",
    },
  ];
  snapshot.personMedia = [
    {
      id: "person-media-photo-1",
      person_id: "person-1",
      media_id: "media-photo-1",
      is_primary: true,
    },
  ];
  return snapshot;
}

describe("builder workspace", () => {
  beforeEach(() => {
    window.localStorage.removeItem("antigravity.builder.tree-1.canvasHeight");
    window.localStorage.removeItem("antigravity.builder.tree-1.activePanel");
    window.localStorage.removeItem("antigravity.builder.tree-1.visualRootPersonId");
    window.localStorage.removeItem("antigravity.builder.tree-1.selectedPersonId");
    uploadFileWithTransportContract.mockClear();
    vi.restoreAllMocks();
  });

  it("restores the canvas height from localStorage", async () => {
    window.localStorage.setItem("antigravity.builder.tree-1.canvasHeight", "1234");

    const { container } = render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      const shell = container.querySelector(".builder-canvas-shell");
      expect(shell).toHaveStyle({ height: "1234px" });
    });

    expect(screen.getByTestId("family-tree-canvas")).toBeInTheDocument();
  });

  it("restores the selected inspector panel from localStorage", async () => {
    window.localStorage.setItem("antigravity.builder.tree-1.activePanel", "media");

    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Фото" })).toHaveClass("builder-panel-tab-active");
    });

    expect(screen.getByText("Галерея фото")).toBeInTheDocument();
  });

  it("shows document management in info and separate video tab content", async () => {
    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Инфо" })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Выбрать документы" })).toBeInTheDocument();
    expect(screen.getByText("Demo Document")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Видео" }));

    expect(screen.getByText("Галерея видео")).toBeInTheDocument();
    expect(screen.getByText("Локально загруженных видео пока нет.")).toBeInTheDocument();
  });

  it("restores the visual root person from localStorage", async () => {
    window.localStorage.setItem("antigravity.builder.tree-1.visualRootPersonId", "person-1");

    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getAllByText("Demo Person").length).toBeGreaterThan(0);
      expect(screen.queryByText("Текущий корень")).not.toBeInTheDocument();
    });
  });

  it("restores the selected person from localStorage", async () => {
    window.localStorage.setItem("antigravity.builder.tree-1.selectedPersonId", "person-1");

    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getAllByText("Demo Person").length).toBeGreaterThan(0);
      expect(screen.queryByText("Текущий корень")).not.toBeInTheDocument();
    });
  });

  it("submits the person form when Enter is pressed in the full-name field", async () => {
    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    const nameInput = (await screen.findByDisplayValue("Demo Person")) as HTMLInputElement;
    const form = nameInput.closest("form") as HTMLFormElement;
    const requestSubmitSpy = vi.fn();
    Object.defineProperty(form, "requestSubmit", {
      configurable: true,
      value: requestSubmitSpy,
    });

    fireEvent.keyDown(nameInput, { key: "Enter", code: "Enter" });

    expect(requestSubmitSpy).toHaveBeenCalled();
  });

  it("keeps the inspector compact for an already selected person", async () => {
    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Demo Person")).toBeInTheDocument();
    });

    expect(screen.queryByText("Данные человека")).not.toBeInTheDocument();
    expect(screen.queryByText("Изменения сохраняются по кнопке ниже.")).not.toBeInTheDocument();
    expect(screen.queryByText("Здесь редактируются данные, связи и документы выбранного человека.")).not.toBeInTheDocument();
  });

  it("shows a transient toast after saving a person instead of an inline success block", async () => {
    const snapshot = createSnapshot();

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url.endsWith("/api/persons/person-1") && init?.method === "PATCH") {
        return Response.json(
          {
            person: {
              ...snapshot.people[0],
              full_name: "Обновленное имя",
            },
            message: "Данные человека обновлены."
          },
          { status: 200 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    render(<BuilderWorkspace snapshot={snapshot} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Demo Person")).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("Demo Person");
    fireEvent.change(nameInput, { target: { value: "Обновленное имя" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Данные человека обновлены.");
    });
    expect(screen.queryByText("Данные человека обновлены.", { selector: ".form-success" })).not.toBeInTheDocument();
  });

  it("shows an explicit proxy-override hint for Cloudflare uploads", async () => {
    const snapshot = createSnapshot();

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url.includes("/api/media/upload-intent")) {
        return Response.json(
          {
            mediaId: "media-upload-1",
            kind: "photo",
            path: "trees/tree-1/media/photo/media-upload-1/family-photo.png",
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
                path: "trees/tree-1/media/photo/media-upload-1/variants/thumb.webp",
                signedUrl: "https://example.com/thumb",
                token: null,
                uploadProvider: "object_storage",
              },
            ],
          },
          { status: 201 }
        );
      }

      if (url.includes("/api/media/complete")) {
        return Response.json({ message: "Готово." }, { status: 201 });
      }

      if (url.includes("/api/tree/demo-tree/builder-snapshot?includeMedia=1")) {
        return Response.json(snapshot, { status: 200 });
      }

      return Response.json({}, { status: 200 });
    });

    render(<BuilderWorkspace snapshot={snapshot} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Фото" }));

    const input = screen.getByLabelText("Фотографии с устройства") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "family-photo.png", { type: "image/png" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input);

    expect(screen.getByRole("dialog", { name: "Проверка файлов перед загрузкой" })).toBeInTheDocument();
    expect(uploadFileWithTransportContract).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить 1" }));

    await waitFor(() => {
      expect(uploadFileWithTransportContract).toHaveBeenCalled();
    });

    expect(screen.queryByText("Cloudflare R2 активен, но этот запуск принудительно использует серверный proxy upload.")).not.toBeInTheDocument();
  });

  it("asks for confirmation before discarding a pending upload batch", async () => {
    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Фото" }));

    const input = screen.getByLabelText("Фотографии с устройства") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "family-photo.png", { type: "image/png" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input);

    expect(screen.getByRole("dialog", { name: "Проверка файлов перед загрузкой" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(screen.getByRole("dialog", { name: "Сбросить выбранные файлы" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сбросить набор" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Проверка файлов перед загрузкой" })).not.toBeInTheDocument();
    });

    expect(screen.getByText("Файлы не выбраны")).toBeInTheDocument();
  });

  it("shows a video preview tile in the upload review dialog for local video files", async () => {
    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Видео" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Видео" }));

    const input = screen.getByLabelText("Видео с устройства") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "family-video.mp4", { type: "video/mp4" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input);

    expect(screen.getByRole("dialog", { name: "Проверка файлов перед загрузкой" })).toBeInTheDocument();
    expect(document.querySelector("video.archive-tile-video")).not.toBeNull();
  });

  it("links photo footer to the archive album view", async () => {
    render(<BuilderWorkspace snapshot={createSnapshotWithPhoto()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Фото" }));
    expect(screen.getByText("1 фото загружено")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Загрузить фото" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в альбом" })).toHaveAttribute("href", "/tree/demo-tree/media?mode=photo&view=albums");
  });

  it("renders the shared person photo gallery inside the builder photo tab", async () => {
    render(<BuilderWorkspace snapshot={createSnapshotWithPhoto()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Фото" }));

    expect(screen.getByTestId("person-media-gallery")).toBeInTheDocument();
  });

  it("resizes the canvas and persists the updated height", async () => {
    window.localStorage.setItem("antigravity.builder.tree-1.canvasHeight", "980");
    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    const { container } = render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      const shell = container.querySelector(".builder-canvas-shell");
      expect(shell).toHaveStyle({ height: "980px" });
    });

    fireEvent.pointerDown(screen.getByRole("button", { name: "Изменить высоту схемы" }), { clientY: 100 });
    fireEvent.pointerMove(window, { clientY: 240 });
    fireEvent.pointerUp(window);

    await waitFor(() => {
      const shell = container.querySelector(".builder-canvas-shell");
      expect(shell).toHaveStyle({ height: "1120px" });
    });

    expect(setItemSpy).toHaveBeenCalledWith("antigravity.builder.tree-1.canvasHeight", "1120");
  });

  it("clamps canvas resize to the configured minimum and maximum heights", async () => {
    window.localStorage.setItem("antigravity.builder.tree-1.canvasHeight", "980");
    const { container } = render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);
    const handle = screen.getByRole("button", { name: "Изменить высоту схемы" });

    await waitFor(() => {
      const shell = container.querySelector(".builder-canvas-shell");
      expect(shell).toHaveStyle({ height: "980px" });
    });

    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerMove(window, { clientY: -1000 });
    fireEvent.pointerUp(window);

    await waitFor(() => {
      const shell = container.querySelector(".builder-canvas-shell");
      expect(shell).toHaveStyle({ height: "700px" });
    });

    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerMove(window, { clientY: 2000 });
    fireEvent.pointerUp(window);

    await waitFor(() => {
      const shell = container.querySelector(".builder-canvas-shell");
      expect(shell).toHaveStyle({ height: "1600px" });
    });
  });
});
