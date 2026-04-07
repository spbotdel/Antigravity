import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadFileWithTransportContract } = vi.hoisted(() => ({
  uploadFileWithTransportContract: vi.fn(async () => undefined),
}));

const BUILDER_WORKSPACE_SLOW_TEST_TIMEOUT_MS = 20_000;

import { BuilderWorkspace } from "@/components/tree/builder-workspace";
import { Calendar } from "@/components/ui/calendar";
import type { TreeSnapshot } from "@/lib/types";

vi.mock("@/components/tree/family-tree-canvas", () => ({
  FamilyTreeCanvas: () => <div data-testid="family-tree-canvas" />,
}));

vi.mock("@/components/tree/person-media-gallery", () => ({
  PersonMediaGallery: (props: {
    appendTile?: unknown;
    media?: Array<{ id: string; title?: string; kind?: string; provider?: string; preview_status?: string | null }>;
    optimisticVideoPreviewUrls?: Readonly<Record<string, string>>;
    canDeleteMedia?: boolean;
    onDeleteMedia?: (mediaId: string) => Promise<void>;
    showInlineMediaActions?: boolean;
    canManageInlineMediaActions?: boolean;
    getInlineMediaAlbumHref?: (asset: { id: string; title?: string }) => string | null;
    selectionMode?: boolean;
    canSelectMedia?: boolean;
    selectedMediaIds?: ReadonlySet<string>;
    onToggleMediaSelection?: (mediaId: string) => void;
    onStartMediaSelection?: (mediaId: string) => void;
  }) => (
    <div
      data-testid="person-media-gallery"
      data-delete-enabled={props.canDeleteMedia && props.onDeleteMedia ? "true" : "false"}
      data-select-enabled={props.selectionMode && props.canSelectMedia && props.onToggleMediaSelection ? "true" : "false"}
      data-actions-enabled={props.showInlineMediaActions && !props.selectionMode ? "true" : "false"}
      data-media-count={String(props.media?.length ?? 0)}
    >
      {(props.media || []).map((item) =>
        props.optimisticVideoPreviewUrls?.[item.id] ? (
          <img
            key={`thumb-${item.id}`}
            className="person-media-thumb-visual"
            src={props.optimisticVideoPreviewUrls[item.id]}
            alt=""
          />
        ) : item.kind === "video" && item.provider === "cloudflare_r2" && item.preview_status === "ready" ? (
          <img
            key={`server-thumb-${item.id}`}
            className="person-media-thumb-visual"
            src={`/api/media/${item.id}?variant=thumb`}
            alt=""
          />
        ) : null
      )}
      {(props.media || []).map((item) =>
        props.showInlineMediaActions && !props.selectionMode ? (
          <div key={`actions-${item.id}`}>
            <button type="button">Открыть действия для {item.id}</button>
            <a href={`/api/media/${item.id}`}>Скачать {item.id}</a>
            <a href={props.getInlineMediaAlbumHref?.(item) || "#"}>Перейти к альбому {item.id}</a>
            {props.canManageInlineMediaActions && props.onStartMediaSelection ? (
              <button type="button" onClick={() => props.onStartMediaSelection?.(item.id)}>
                Выбрать несколько {item.id}
              </button>
            ) : null}
            {props.canManageInlineMediaActions && props.onDeleteMedia ? (
              <button type="button" onClick={() => void props.onDeleteMedia?.(item.id)}>
                Удалить медиа {item.id}
              </button>
            ) : null}
          </div>
        ) : null
      )}
      {(props.media || []).map((item) =>
        props.selectionMode && props.canSelectMedia && props.onToggleMediaSelection ? (
          <label key={`select-${item.id}`}>
            <input
              type="checkbox"
              aria-label={`Выбрать медиа ${item.id}`}
              checked={props.selectedMediaIds?.has(item.id) ?? false}
              onChange={() => props.onToggleMediaSelection?.(item.id)}
            />
          </label>
        ) : null
      )}
      {props.appendTile as any}
      {props.onDeleteMedia && (props.media?.length ?? 0) > 0 ? (
        <button type="button" onClick={() => void props.onDeleteMedia?.(props.media?.[0]?.id || "")}>
          Удалить медиа из галереи
        </button>
      ) : null}
    </div>
  ),
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
        preview_status: null,
        preview_error: null,
        preview_attempt_count: 0,
        preview_claimed_at: null,
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
      preview_status: null,
      preview_error: null,
      preview_attempt_count: 0,
      preview_claimed_at: null,
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

function createSnapshotWithPhotos(count: number): TreeSnapshot {
  const snapshot = createSnapshot();
  snapshot.media = Array.from({ length: count }, (_, index) => ({
    id: `media-photo-${index + 1}`,
    tree_id: "tree-1",
    kind: "photo" as const,
    provider: "object_storage" as const,
    visibility: "members" as const,
    storage_path: `trees/tree-1/media/photo/media-photo-${index + 1}/photo.jpg`,
    external_url: null,
    title: `Demo Photo ${index + 1}`,
    caption: null,
    mime_type: "image/jpeg",
    size_bytes: 1024,
    preview_status: null,
    preview_error: null,
    preview_attempt_count: 0,
    preview_claimed_at: null,
    created_by: null,
    created_at: "2026-03-09T00:00:00.000Z",
  }));
  snapshot.personMedia = Array.from({ length: count }, (_, index) => ({
    id: `person-media-photo-${index + 1}`,
    person_id: "person-1",
    media_id: `media-photo-${index + 1}`,
    is_primary: index === 0,
  }));
  return snapshot;
}

function createSnapshotWithRelations(): TreeSnapshot {
  const snapshot = createSnapshot();
  snapshot.people = [
    snapshot.people[0],
    {
      id: "person-parent-1",
      tree_id: "tree-1",
      full_name: "Отец первого",
      gender: "male",
      birth_date: null,
      death_date: null,
      birth_place: null,
      death_place: null,
      bio: null,
      is_living: true,
      created_by: null,
      created_at: "2026-03-09T00:00:00.000Z",
      updated_at: "2026-03-09T00:00:00.000Z",
    },
    {
      id: "person-child-1",
      tree_id: "tree-1",
      full_name: "Новый ребенок",
      gender: null,
      birth_date: null,
      death_date: null,
      birth_place: null,
      death_place: null,
      bio: null,
      is_living: true,
      created_by: null,
      created_at: "2026-03-09T00:00:00.000Z",
      updated_at: "2026-03-09T00:00:00.000Z",
    },
    {
      id: "person-partner-1",
      tree_id: "tree-1",
      full_name: "Елена",
      gender: "female",
      birth_date: null,
      death_date: null,
      birth_place: null,
      death_place: null,
      bio: null,
      is_living: true,
      created_by: null,
      created_at: "2026-03-09T00:00:00.000Z",
      updated_at: "2026-03-09T00:00:00.000Z",
    },
  ];
  snapshot.parentLinks = [
    {
      id: "parent-link-1",
      tree_id: "tree-1",
      parent_person_id: "person-parent-1",
      child_person_id: "person-1",
      relation_type: "biological",
      created_at: "2026-03-09T00:00:00.000Z",
    },
    {
      id: "parent-link-2",
      tree_id: "tree-1",
      parent_person_id: "person-1",
      child_person_id: "person-child-1",
      relation_type: "biological",
      created_at: "2026-03-09T00:00:00.000Z",
    },
  ];
  snapshot.partnerships = [
    {
      id: "partnership-1",
      tree_id: "tree-1",
      person_a_id: "person-1",
      person_b_id: "person-partner-1",
      status: "partner",
      start_date: null,
      end_date: null,
      created_at: "2026-03-09T00:00:00.000Z",
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

  it("floors a stored canvas height to the current viewport parity height", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 1000,
    });
    window.localStorage.setItem("antigravity.builder.tree-1.canvasHeight", "700");

    const { container } = render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      const shell = container.querySelector(".builder-canvas-shell");
      expect(shell).toHaveStyle({ height: "914px" });
    });
  });

  it("renders a minimal tree overlay inside the canvas shell in tree mode", async () => {
    const { container } = render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      const shell = container.querySelector(".builder-canvas-shell");
      expect(shell).not.toBeNull();
      expect(shell?.querySelector(".tree-overlay")).not.toBeNull();
    });

  const shell = container.querySelector(".builder-canvas-shell") as HTMLElement;
  expect(within(shell).getByText("Demo Tree")).toBeInTheDocument();
  expect(within(shell).getByText("1 человек • 1 поколение")).toBeInTheDocument();
  expect(screen.queryByText("Схема дерева")).not.toBeInTheDocument();
  expect(screen.queryByText("Выберите блок, чтобы он подсветился. Кнопка + открывает меню связей, корзина удаляет выбранного человека.")).not.toBeInTheDocument();
});

  it("restores the selected inspector panel from localStorage", async () => {
    window.localStorage.setItem("antigravity.builder.tree-1.activePanel", "media");

    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toHaveAttribute("aria-selected", "true");
    });

    expect(screen.getByRole("button", { name: "Добавить фото" })).toBeInTheDocument();
    expect(screen.queryByText("Галерея фото")).not.toBeInTheDocument();
  });

  it("shows documents as a flat info list and keeps video content in a single gallery block", async () => {
    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Инфо" })).toBeInTheDocument();
    });

    expect(screen.getAllByText("Документы")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Загрузить файл" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Demo Document" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить документ «Demo Document»" })).toBeInTheDocument();
    expect(screen.queryByText("Сканы, письма и другие файлы, которые удобнее держать рядом с биографией, а не в фото- или видео-галерее.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Открыть документ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить документ" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));

    expect(screen.queryByText("Галерея видео")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить видео" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Загрузить видео" })).not.toBeInTheDocument();
    expect(screen.queryByText("Видео по ссылке")).not.toBeInTheDocument();
    expect(screen.queryByText("Локально загруженных видео пока нет.")).not.toBeInTheDocument();
    expect(screen.queryByText("Локальные видео")).not.toBeInTheDocument();
    expect(screen.queryByText("Внешние видео по ссылке пока не добавлены.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Выбрать видео" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Добавить видео" }));

    expect(screen.getByRole("button", { name: "Видео по ссылке" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Загрузить видео" })).toBeInTheDocument();
    expect(screen.queryByText("Выберите, как добавить видео: загрузить файл с устройства или указать внешнюю ссылку.")).not.toBeInTheDocument();
  }, BUILDER_WORKSPACE_SLOW_TEST_TIMEOUT_MS);

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

  it("renders the tree heading overlay with derived people and generation counts and saves the title inline for owners", async () => {
    const snapshot = createSnapshot();
    snapshot.people.push({
      id: "person-2",
      tree_id: "tree-1",
      full_name: "Second Person",
      gender: "female",
      birth_date: null,
      death_date: null,
      birth_place: null,
      death_place: null,
      bio: null,
      is_living: true,
      created_by: null,
      created_at: "2026-03-09T00:00:00.000Z",
      updated_at: "2026-03-09T00:00:00.000Z",
    });
    snapshot.parentLinks.push({
      id: "link-1",
      tree_id: "tree-1",
      parent_person_id: "person-1",
      child_person_id: "person-2",
      relation_type: "biological",
      created_at: "2026-03-09T00:00:00.000Z",
    });

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url.endsWith("/api/trees/tree-1") && init?.method === "PATCH") {
        return Response.json(
          {
            tree: {
              ...snapshot.tree,
              title: "Семья Русякиных",
            },
            message: "Данные дерева обновлены."
          },
          { status: 200 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    render(<BuilderWorkspace snapshot={snapshot} mediaLoaded />);

    await waitFor(() => {
      expect(document.querySelector(".builder-tree-overlay")).not.toBeNull();
    });

    const overlay = document.querySelector(".builder-tree-overlay") as HTMLElement;
    expect(within(overlay).getByText("Demo Tree")).toBeInTheDocument();
    expect(within(overlay).getByText("2 человека • 2 поколения")).toBeInTheDocument();

    fireEvent.click(within(overlay).getByRole("button", { name: "Редактировать название дерева" }));

    const titleInput = within(overlay).getByLabelText("Название дерева");
    fireEvent.change(titleInput, { target: { value: "Семья Русякиных" } });
    fireEvent.keyDown(titleInput, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(within(overlay).getByText("Семья Русякиных")).toBeInTheDocument();
    });
  });

  it("keeps the tree heading read-only for editors without settings access", async () => {
    const snapshot = createSnapshot();
    snapshot.actor.role = "admin";
    snapshot.actor.canManageSettings = false;

    render(<BuilderWorkspace snapshot={snapshot} mediaLoaded />);

    await waitFor(() => {
      expect(document.querySelector(".builder-tree-overlay")).not.toBeNull();
    });

    const overlay = document.querySelector(".builder-tree-overlay") as HTMLElement;
    expect(within(overlay).getByText("Demo Tree")).toBeInTheDocument();
    expect(within(overlay).getByText("1 человек • 1 поколение")).toBeInTheDocument();
    expect(within(overlay).queryByRole("button", { name: "Редактировать название дерева" })).not.toBeInTheDocument();
  });

  it("uses the same shared person-card-name class for the header across info, photo, and video tabs", async () => {
    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Редактировать имя человека" })).toBeInTheDocument();
    });

    const inspector = document.querySelector(".builder-inspector") as HTMLElement;
    expect(inspector.querySelector("button.builder-inspector-name-button .person-card-name")).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    expect(inspector.querySelector("h2.person-card-name")).not.toBeNull();
    expect(inspector.querySelector("button.builder-inspector-name-button")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));
    expect(inspector.querySelector("h2.person-card-name")).not.toBeNull();
    expect(inspector.querySelector("button.builder-inspector-name-button")).toBeNull();
  });

  it("saves the header name inline when Enter is pressed", async () => {
    const snapshot = createSnapshot();

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url.endsWith("/api/persons/person-1") && init?.method === "PATCH") {
        return Response.json(
          {
            person: {
              ...snapshot.people[0],
              full_name: "Новое имя",
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
      const inspector = document.querySelector(".builder-inspector");
      expect(inspector).not.toBeNull();
      expect(within(inspector as HTMLElement).getByRole("button", { name: "Редактировать имя человека" })).toBeInTheDocument();
    });

    const inspector = document.querySelector(".builder-inspector") as HTMLElement;
    fireEvent.click(within(inspector).getByRole("button", { name: "Редактировать имя человека" }));

    const nameInput = within(inspector).getByLabelText("Имя человека");
    fireEvent.change(nameInput, { target: { value: "Новое имя" } });
    fireEvent.keyDown(nameInput, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(within(inspector).getByText("Новое имя")).toBeInTheDocument();
    });
    expect(within(inspector).queryByText("Полное имя")).not.toBeInTheDocument();
  });

  it("keeps the inspector compact for an already selected person", async () => {
    render(<BuilderWorkspace snapshot={createSnapshotWithPhoto()} mediaLoaded />);

    await waitFor(() => {
      const inspector = document.querySelector(".builder-inspector");
      expect(inspector).not.toBeNull();
      expect(within(inspector as HTMLElement).getByText("Demo Person")).toBeInTheDocument();
    });

    const inspector = document.querySelector(".builder-inspector") as HTMLElement;
    expect(within(inspector).getByAltText("Аватар: Demo Person")).toBeInTheDocument();
    expect((inspector.querySelector('input[name="birthDate"]') as HTMLInputElement | null)?.value).toBe("1990-01-01");
    expect((inspector.querySelectorAll('input[name="birthDate"]') || []).length).toBe(1);
    expect((inspector.querySelectorAll('input[name="deathDate"]') || []).length).toBe(1);
    const bioTextarea = within(inspector).getByPlaceholderText("Краткая информация о человеке…") as HTMLTextAreaElement;
    expect(within(inspector).queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
    expect(within(inspector).queryByRole("button", { name: "Удалить" })).not.toBeInTheDocument();
    expect(within(inspector).queryByText("Полное имя")).not.toBeInTheDocument();
    expect(within(inspector).queryByText("Пол")).not.toBeInTheDocument();
    expect(within(inspector).queryByText("Дата рождения")).not.toBeInTheDocument();
    expect(within(inspector).queryByText("Дата смерти")).not.toBeInTheDocument();
    expect(screen.queryByText("Данные человека")).not.toBeInTheDocument();
    expect(screen.queryByText("Изменения сохраняются по кнопке ниже.")).not.toBeInTheDocument();
    expect(screen.queryByText("Здесь редактируются данные, связи и документы выбранного человека.")).not.toBeInTheDocument();
    expect(within(inspector).queryByRole("button", { name: "Сделать корнем" })).not.toBeInTheDocument();
    expect(bioTextarea.closest(".builder-section-block")).toBeNull();
  });

  it("keeps an avatar block in the header even when the selected person has no photo", async () => {
    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      const inspector = document.querySelector(".builder-inspector");
      expect(inspector).not.toBeNull();
      expect(within(inspector as HTMLElement).getByText("Demo Person")).toBeInTheDocument();
    });

    const inspector = document.querySelector(".builder-inspector") as HTMLElement;
    expect(inspector.querySelector(".builder-inspector-avatar")).not.toBeNull();
    expect(inspector.querySelector(".builder-inspector-avatar-fallback")).not.toBeNull();
  });

  it("uses the top meta row for gender and life dates while preserving the existing save flow", async () => {
    const snapshot = createSnapshot();
    let patchPayload: Record<string, unknown> | null = null;

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url.endsWith("/api/persons/person-1") && init?.method === "PATCH") {
        patchPayload = JSON.parse(String(init.body));
        const nextGender = patchPayload?.gender ?? snapshot.people[0].gender;
        return Response.json(
          {
            person: {
              ...snapshot.people[0],
              gender: nextGender,
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
      const inspector = document.querySelector(".builder-inspector");
      expect(inspector).not.toBeNull();
      expect(within(inspector as HTMLElement).getByRole("button", { name: "Мужчина" })).toBeInTheDocument();
      expect(within(inspector as HTMLElement).getByRole("button", { name: "Женщина" })).toBeInTheDocument();
    });

    const inspector = document.querySelector(".builder-inspector") as HTMLElement;
    const hiddenGenderInput = inspector.querySelector('input[name="gender"]') as HTMLInputElement;
    const maleButton = within(inspector).getByRole("button", { name: "Мужчина" });
    const femaleButton = within(inspector).getByRole("button", { name: "Женщина" });
    const birthDateInput = inspector.querySelector('input[name="birthDate"]') as HTMLInputElement;
    const deathDateInput = inspector.querySelector('input[name="deathDate"]') as HTMLInputElement;

    expect(hiddenGenderInput.value).toBe("male");
    expect(birthDateInput.value).toBe("1990-01-01");
    expect(deathDateInput.value).toBe("");

    fireEvent.click(femaleButton);
    fireEvent.change(birthDateInput, { target: { value: "1991-02-03" } });
    fireEvent.change(deathDateInput, { target: { value: "2001-04-05" } });

    await waitFor(() => {
      expect(hiddenGenderInput.value).toBe("female");
    });

    await waitFor(() => {
      expect(patchPayload).toMatchObject({
        gender: "female",
        birthDate: "1991-02-03",
        deathDate: "2001-04-05",
      });
    }, { timeout: 1500 });

    await waitFor(() => {
      expect(within(inspector).getByText("Сохранено ✓")).toBeInTheDocument();
    }, { timeout: 1500 });
  });

  it("shows month and year dropdowns in the meta date popover and keeps clear working", async () => {
    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      const inspector = document.querySelector(".builder-inspector");
      expect(inspector).not.toBeNull();
      expect((inspector?.querySelector('input[name="birthDate"]') as HTMLInputElement | null)?.value).toBe("1990-01-01");
    });

    const inspector = document.querySelector(".builder-inspector") as HTMLElement;
    const birthDateInput = inspector.querySelector('input[name="birthDate"]') as HTMLInputElement;

    fireEvent.click(within(inspector).getByLabelText("Дата рождения"));

    const [monthDropdown, yearDropdown] = await screen.findAllByRole("combobox", undefined, { timeout: 3000 });

    expect(monthDropdown).toBeInTheDocument();
    expect(yearDropdown).toBeInTheDocument();
    expect(Array.from(monthDropdown.querySelectorAll("option")).map((option) => option.textContent)).toEqual(
      expect.arrayContaining(["январь", "март", "декабрь"])
    );

    fireEvent.click(await screen.findByRole("button", { name: "Очистить" }, { timeout: 3000 }));

    await waitFor(() => {
      expect(birthDateInput.value).toBe("");
    });
  }, BUILDER_WORKSPACE_SLOW_TEST_TIMEOUT_MS);

  it("autosaves the bio field after inactivity, skips duplicate saves, and forces save on blur", async () => {
    const snapshot = createSnapshot();
    const patchPayloads: Record<string, unknown>[] = [];
    const patchResolvers: Array<() => void> = [];

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url.endsWith("/api/persons/person-1") && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body));
        patchPayloads.push(payload);
        await new Promise<void>((resolve) => {
          patchResolvers.push(resolve);
        });
        return Response.json(
          {
            person: {
              ...snapshot.people[0],
              bio: payload.bio ?? null,
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
      const inspector = document.querySelector(".builder-inspector");
      expect(inspector).not.toBeNull();
      expect(within(inspector as HTMLElement).getByLabelText("Био")).toBeInTheDocument();
    });

    const inspector = document.querySelector(".builder-inspector") as HTMLElement;
    const bioTextarea = within(inspector).getByLabelText("Био") as HTMLTextAreaElement;

    fireEvent.change(bioTextarea, { target: { value: "Новая биография" } });
    expect(patchPayloads).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(patchPayloads).toHaveLength(0);

    await waitFor(() => {
      expect(patchPayloads).toHaveLength(1);
    }, { timeout: 1500 });
    expect(patchPayloads[0]).toMatchObject({ bio: "Новая биография" });
    expect(within(inspector).getByText("Сохраняется…")).toBeInTheDocument();

    const firstResolve = patchResolvers.shift();
    expect(firstResolve).toBeDefined();
    firstResolve?.();

    await waitFor(() => {
      expect(within(inspector).getByText("Сохранено ✓")).toBeInTheDocument();
    });

    fireEvent.change(bioTextarea, { target: { value: "Новая биография" } });
    await new Promise((resolve) => setTimeout(resolve, 950));
    expect(patchPayloads).toHaveLength(1);

    fireEvent.change(bioTextarea, { target: { value: "Короткая новая биография" } });
    fireEvent.blur(bioTextarea);

    await waitFor(() => {
      expect(patchPayloads).toHaveLength(2);
    }, { timeout: 1000 });
    expect(patchPayloads[1]).toMatchObject({ bio: "Короткая новая биография" });

    const secondResolve = patchResolvers.shift();
    expect(secondResolve).toBeDefined();
    secondResolve?.();

    await waitFor(() => {
      expect(within(inspector).getByText("Сохранено ✓")).toBeInTheDocument();
    });
  });

  it("renders current relations as a calm list with clickable names and subtle remove buttons", async () => {
    const snapshot = createSnapshotWithRelations();
    const requests: Array<{ url: string; method?: string }> = [];

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      requests.push({ url, method: init?.method });

      if (url.endsWith("/api/relationships/parent-child/parent-link-1") && init?.method === "DELETE") {
        return Response.json({ message: "Связь удалена." }, { status: 200 });
      }

      return Response.json({}, { status: 200 });
    });

    render(<BuilderWorkspace snapshot={snapshot} mediaLoaded />);

    await waitFor(() => {
      const inspector = document.querySelector(".builder-inspector");
      expect(inspector).not.toBeNull();
      expect(within(inspector as HTMLElement).getByText("Текущие связи")).toBeInTheDocument();
    });

    const inspector = document.querySelector(".builder-inspector") as HTMLElement;
    expect(within(inspector).queryByText("Родственная связь")).not.toBeInTheDocument();
    expect(within(inspector).queryByRole("button", { name: "Открыть" })).not.toBeInTheDocument();
    expect(within(inspector).getByText("Партнёры")).toBeInTheDocument();
    expect(within(inspector).queryByText("Пары")).not.toBeInTheDocument();

    fireEvent.click(within(inspector).getByRole("button", { name: "Удалить связь с «Отец первого»" }));

    await waitFor(() => {
      expect(requests.some((request) => request.url.endsWith("/api/relationships/parent-child/parent-link-1") && request.method === "DELETE")).toBe(true);
    });

    fireEvent.click(within(inspector).getByRole("button", { name: "Елена" }));

    await waitFor(() => {
      expect(within(document.querySelector(".builder-inspector") as HTMLElement).getByText("Елена")).toBeInTheDocument();
    });
  });

  it("shows a transient toast after saving a person instead of an inline success block", async () => {
    const snapshot = createSnapshot();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
      const inspector = document.querySelector(".builder-inspector");
      expect(inspector).not.toBeNull();
      expect(within(inspector as HTMLElement).getByRole("button", { name: "Редактировать имя человека" })).toBeInTheDocument();
    });

    const inspector = document.querySelector(".builder-inspector") as HTMLElement;
    fireEvent.click(within(inspector).getByRole("button", { name: "Редактировать имя человека" }));

    const nameInput = within(inspector).getByLabelText("Имя человека");
    fireEvent.change(nameInput, { target: { value: "Обновленное имя" } });
    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(screen.getAllByRole("status").some((element) => element.textContent?.includes("Данные человека обновлены."))).toBe(true);
    });
    expect(within(inspector).getByText("Обновленное имя")).toBeInTheDocument();
    expect(within(inspector).queryByText("Полное имя")).not.toBeInTheDocument();
    expect(screen.queryByText("Данные человека обновлены.", { selector: ".form-success" })).not.toBeInTheDocument();
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        call.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("changing the default value state of an uncontrolled FieldControl")
        )
      )
    ).toBe(false);
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
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));

    const input = screen.getByLabelText("Фотографии с устройства") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "family-photo.png", { type: "image/png" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input);

    expect(screen.getByRole("dialog", { name: "Проверка файлов перед загрузкой" })).toBeInTheDocument();
    expect(screen.getByLabelText("Сводка выбранных файлов")).toHaveTextContent("1 файл");
    expect(screen.getByLabelText("Сводка выбранных файлов")).toHaveTextContent("1 фото");
    expect(screen.queryByText("family-photo.png")).not.toBeInTheDocument();
    expect(screen.getByText("Фото • 3 Б")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Проверить фото перед загрузкой" })).not.toBeInTheDocument();
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
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));

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
  }, BUILDER_WORKSPACE_SLOW_TEST_TIMEOUT_MS);

  it("shows a video preview tile in the upload review dialog for local video files", async () => {
    render(<BuilderWorkspace snapshot={createSnapshot()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Видео" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));

    const input = screen.getByLabelText("Видео с устройства") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "family-video.mp4", { type: "video/mp4" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input);

    expect(screen.getByRole("dialog", { name: "Проверка файлов перед загрузкой" })).toBeInTheDocument();
    expect(document.querySelector("video.archive-tile-video")).not.toBeNull();
    expect(screen.queryByText("family-video.mp4")).not.toBeInTheDocument();
    expect(screen.getByText("Видео • 3 Б")).toBeInTheDocument();
    expect(screen.getByLabelText("Сводка выбранных файлов")).toHaveTextContent("1 видео");
  });

  it("updates a newly uploaded cloudflare video to its generated preview without full page reload", async () => {
    const snapshot = createSnapshot();
    let snapshotPolls = 0;

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url.includes("/api/media/upload-intent")) {
        return Response.json(
          {
            mediaId: "builder-video-pending-1",
            kind: "video",
            path: "trees/tree-1/media/video/builder-video-pending-1/video.webm",
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

      if (url.includes("/api/media/complete")) {
        return Response.json(
          {
            message: "Файл сохранен.",
            media: {
              id: "builder-video-pending-1",
              tree_id: "tree-1",
              kind: "video",
              provider: "cloudflare_r2",
              visibility: "members",
              storage_path: "trees/tree-1/media/video/builder-video-pending-1/video.webm",
              external_url: null,
              title: "family-video.webm",
              caption: "",
              mime_type: "video/webm",
              size_bytes: 3,
              preview_status: "pending",
              preview_error: null,
              preview_attempt_count: 0,
              preview_claimed_at: null,
              created_by: "user-1",
              created_at: "2026-03-28T00:00:00.000Z",
            }
          },
          { status: 201 }
        );
      }

      if (url.includes("/api/tree/demo-tree/builder-snapshot?includeMedia=1")) {
        snapshotPolls += 1;
        return Response.json(
          {
            ...snapshot,
            media: [
              {
                id: "builder-video-pending-1",
                tree_id: "tree-1",
                kind: "video",
                provider: "cloudflare_r2",
                visibility: "members",
                storage_path: "trees/tree-1/media/video/builder-video-pending-1/video.webm",
                external_url: null,
                title: "family-video.webm",
                caption: "",
                mime_type: "video/webm",
                size_bytes: 3,
                preview_status: snapshotPolls >= 2 ? "ready" : "pending",
                preview_error: null,
                preview_attempt_count: 1,
                preview_claimed_at: null,
                created_by: "user-1",
                created_at: "2026-03-28T00:00:00.000Z",
              }
            ],
            personMedia: [
              {
                id: "pm-video-1",
                person_id: "person-1",
                media_id: "builder-video-pending-1",
                is_primary: false,
              }
            ]
          },
          { status: 200 }
        );
      }

      return Response.json({}, { status: 200 });
    });

    render(<BuilderWorkspace snapshot={snapshot} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Видео" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));

    const input = screen.getByLabelText("Видео с устройства") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "family-video.webm", { type: "video/webm" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input);

    const dialog = await screen.findByRole("dialog", { name: "Проверка файлов перед загрузкой" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить 1" }));

    await waitFor(() => {
      const thumbImage = document.querySelector('img[src="/api/media/builder-video-pending-1?variant=thumb"]');
      expect(thumbImage).not.toBeNull();
      expect(thumbImage).toHaveAttribute("src", "/api/media/builder-video-pending-1?variant=thumb");
    }, { timeout: 5000 });
  });

  it("keeps photo access lightweight with an album shortcut and a single add tile", async () => {
    render(<BuilderWorkspace snapshot={createSnapshotWithPhoto()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));

    expect(screen.getByRole("link", { name: "Перейти в альбом" })).toHaveAttribute("href", "/tree/demo-tree/media?mode=photo&view=albums");
    expect(screen.getByRole("button", { name: "Добавить фото" })).toBeInTheDocument();
    expect(screen.queryByText("1 фото загружено")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Загрузить фото" })).not.toBeInTheDocument();
  });

  it("renders the shared person photo gallery inside the builder photo tab", async () => {
    render(<BuilderWorkspace snapshot={createSnapshotWithPhoto()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));

    expect(screen.getByTestId("person-media-gallery")).toBeInTheDocument();
  });

  it("enters bulk selection mode from the per-card menu and clears it on cancel", async () => {
    render(<BuilderWorkspace snapshot={createSnapshotWithPhotos(2)} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));

    expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-actions-enabled", "true");
    expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-select-enabled", "false");
    expect(screen.queryByRole("region", { name: "Действия с выбранными фотографиями" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько media-photo-1" }));

    expect(screen.getByRole("region", { name: "Действия с выбранными фотографиями" })).toBeInTheDocument();
    expect(screen.getByText("Выбрано: 1")).toBeInTheDocument();
    expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-select-enabled", "true");
    expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-actions-enabled", "false");

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(screen.queryByRole("region", { name: "Действия с выбранными фотографиями" })).not.toBeInTheDocument();
    expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-select-enabled", "false");
    expect(screen.queryByLabelText("Выбрать медиа media-photo-1")).not.toBeInTheDocument();
  });

  it("clears builder photo selection mode on Escape when no dialog or popover is open", async () => {
    render(<BuilderWorkspace snapshot={createSnapshotWithPhotos(2)} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько media-photo-1" }));

    expect(screen.getByRole("region", { name: "Действия с выбранными фотографиями" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Действия с выбранными фотографиями" })).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-select-enabled", "false");
  });

  it("does not clear builder photo selection on Escape while a confirmation dialog is open", async () => {
    render(<BuilderWorkspace snapshot={createSnapshotWithPhotos(2)} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько media-photo-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(screen.getByRole("dialog", { name: "Удалить выбранные фото?" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("dialog", { name: "Удалить выбранные фото?" })).toBeInTheDocument();
    expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-select-enabled", "true");
  });

  it("does not clear builder photo selection on Escape while a popover is open", async () => {
    render(<BuilderWorkspace snapshot={createSnapshotWithPhotos(2)} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько media-photo-1" }));

    const popover = document.createElement("div");
    popover.setAttribute("data-slot", "popover-content");
    document.body.appendChild(popover);

    try {
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.getByRole("region", { name: "Действия с выбранными фотографиями" })).toBeInTheDocument();
      expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-select-enabled", "true");
    } finally {
      popover.remove();
    }
  });

  it("keeps only download and album actions in the menu for non-owner non-admin roles", async () => {
    const snapshot = createSnapshotWithPhotos(2);
    snapshot.actor.role = "viewer";

    render(<BuilderWorkspace snapshot={snapshot} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));

    expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-select-enabled", "false");
    expect(screen.getByRole("link", { name: "Скачать media-photo-1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти к альбому media-photo-1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Выбрать несколько media-photo-1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить медиа media-photo-1" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Выбрать медиа media-photo-1")).not.toBeInTheDocument();
  });

  it("shows the full per-card action set for owner in the builder photo gallery", async () => {
    render(<BuilderWorkspace snapshot={createSnapshotWithPhoto()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));

    expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-delete-enabled", "true");
    expect(screen.getByRole("link", { name: "Скачать media-photo-1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти к альбому media-photo-1" })).toHaveAttribute("href", "/tree/demo-tree/media?mode=photo&view=albums");
    expect(screen.getByRole("button", { name: "Выбрать несколько media-photo-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить медиа media-photo-1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Видео" }));

    expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-delete-enabled", "false");
    expect(screen.queryByRole("button", { name: "Удалить медиа media-photo-1" })).not.toBeInTheDocument();
  });

  it("deletes a builder photo through the media endpoint and patches the local snapshot without reloading", async () => {
    const requests: Array<{ url: string; method?: string }> = [];

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      requests.push({ url, method: init?.method });

      if (url.endsWith("/api/media/media-photo-1") && init?.method === "DELETE") {
        return Response.json({ message: "Медиа удалено." }, { status: 200 });
      }

      return Response.json({}, { status: 200 });
    });

    render(<BuilderWorkspace snapshot={createSnapshotWithPhoto()} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить медиа media-photo-1" }));

    await waitFor(() => {
      expect(requests.some((request) => request.url.endsWith("/api/media/media-photo-1") && request.method === "DELETE")).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-media-count", "0");
    });

    expect(requests.some((request) => request.url.includes("/api/tree/demo-tree/builder-snapshot"))).toBe(false);
    expect(screen.getAllByRole("status").some((element) => element.textContent?.includes("Медиа удалено."))).toBe(true);
  });

  it("bulk deletes selected builder photos through the existing media endpoint and clears selection", async () => {
    const requests: Array<{ url: string; method?: string }> = [];

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      requests.push({ url, method: init?.method });

      if (
        (url.endsWith("/api/media/media-photo-1") || url.endsWith("/api/media/media-photo-2")) &&
        init?.method === "DELETE"
      ) {
        return Response.json({ message: "Медиа удалено." }, { status: 200 });
      }

      return Response.json({}, { status: 200 });
    });

    render(<BuilderWorkspace snapshot={createSnapshotWithPhotos(3)} mediaLoaded />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Фото" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Фото" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать несколько media-photo-1" }));
    fireEvent.click(screen.getByLabelText("Выбрать медиа media-photo-2"));

    expect(screen.getByText("Выбрано: 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(screen.getByRole("dialog", { name: "Удалить выбранные фото?" })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("dialog", { name: "Удалить выбранные фото?" })).getByRole("button", { name: "Удалить" }));

    await waitFor(() => {
      expect(requests.some((request) => request.url.endsWith("/api/media/media-photo-1") && request.method === "DELETE")).toBe(true);
      expect(requests.some((request) => request.url.endsWith("/api/media/media-photo-2") && request.method === "DELETE")).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId("person-media-gallery")).toHaveAttribute("data-media-count", "1");
    });

    expect(screen.queryByRole("region", { name: "Действия с выбранными фотографиями" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Выбрать медиа media-photo-3")).not.toBeInTheDocument();
    expect(requests.some((request) => request.url.includes("/api/tree/demo-tree/builder-snapshot"))).toBe(false);
    expect(screen.getAllByRole("status").some((element) => element.textContent?.includes("Удалено 2 фото."))).toBe(true);
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

  it("renders selected calendar days without the old heavy primary fill", () => {
    const { container } = render(
      <Calendar
        mode="single"
        selected={new Date("1990-01-14T00:00:00.000Z")}
        defaultMonth={new Date("1990-01-14T00:00:00.000Z")}
        captionLayout="dropdown"
      />
    );

    const selectedDay = container.querySelector('[aria-selected="true"]');
    expect(selectedDay).not.toBeNull();
    expect(selectedDay?.className).not.toContain("bg-primary");
  });
});
