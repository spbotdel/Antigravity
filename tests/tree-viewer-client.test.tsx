import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TreeViewerClient } from "@/components/tree/tree-viewer-client";
import type { TreeSnapshot } from "@/lib/types";

vi.mock("@/components/tree/family-tree-canvas", () => ({
  FamilyTreeCanvas: ({
    people = [],
    onSelectPerson,
    selectedPersonId,
  }: {
    people?: Array<{ id: string; full_name: string }>;
    onSelectPerson?: (personId: string) => void;
    selectedPersonId?: string | null;
  }) => (
    <div data-testid="family-tree-canvas">
      <div data-testid="canvas-selected-person">{selectedPersonId || "none"}</div>
      {people.map((person) => (
        <button key={person.id} type="button" onClick={() => onSelectPerson?.(person.id)}>
          Выбрать {person.full_name}
        </button>
      ))}
    </div>
  )
}));

vi.mock("@/components/tree/person-media-gallery", () => ({
  PersonMediaGallery: ({ avatarMediaId, media = [] }: { avatarMediaId?: string | null; media?: Array<{ title: string }> }) => (
    <div data-testid="person-media-gallery">avatar:{avatarMediaId || "none"}; media:{media.map((item) => item.title).join("|") || "none"}</div>
  )
}));

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
        birth_place: "Moscow",
        death_place: null,
        bio: "Bio",
        is_living: true,
        created_by: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
      {
        id: "person-2",
        tree_id: "tree-1",
        full_name: "Second Person",
        gender: "female",
        birth_date: "1992-02-02",
        death_date: null,
        birth_place: "Kazan",
        death_place: null,
        bio: "Second bio",
        is_living: true,
        created_by: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
    ],
    parentLinks: [
      {
        id: "link-1",
        tree_id: "tree-1",
        parent_person_id: "person-1",
        child_person_id: "person-2",
        relation_type: "biological",
        created_at: "2026-03-09T00:00:00.000Z",
      },
    ],
    partnerships: [],
    media: [
      {
        id: "media-1",
        tree_id: "tree-1",
        kind: "photo",
        provider: "object_storage",
        visibility: "members",
        storage_path: "trees/tree-1/media/photo/media-1/photo.jpg",
        external_url: null,
        title: "Portrait",
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
    ],
    personMedia: [
      {
        id: "pm-1",
        person_id: "person-1",
        media_id: "media-1",
        is_primary: true,
      },
    ],
  };
}

describe("tree viewer client", () => {
  it("renders the tree heading overlay with derived people and generation counts", () => {
    render(<TreeViewerClient snapshot={createSnapshot()} />);

    const overlay = document.querySelector(".viewer-tree-overlay") as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(within(overlay).getByText("Demo Tree")).toBeInTheDocument();
    expect(within(overlay).getByText("2 человека • 2 поколения")).toBeInTheDocument();
    expect(within(overlay).queryByRole("button", { name: "Редактировать название дерева" })).not.toBeInTheDocument();
  });

  it("matches the collapsed rail height to the measured info rail height for each selected person", () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList?.contains("viewer-info-rail")) {
        const isSecondPerson = this.textContent?.includes("Second bio");
        const height = isSecondPerson ? 288 : 612;
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 420,
          bottom: height,
          width: 420,
          height,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return originalGetBoundingClientRect.call(this);
    });

    render(<TreeViewerClient snapshot={createSnapshot()} />);

    const layout = screen.getByTestId("family-tree-canvas").closest(".viewer-layout-overlay") as HTMLElement;
    expect(layout.style.getPropertyValue("--viewer-collapsed-rail-height")).toBe("612px");

    fireEvent.click(screen.getByRole("button", { name: "Выбрать Second Person" }));
    expect(layout.style.getPropertyValue("--viewer-collapsed-rail-height")).toBe("288px");

    rectSpy.mockRestore();
  });

  it("starts collapsed when a selected person exists and opens from the collapsed tab", () => {
    render(<TreeViewerClient snapshot={createSnapshot()} />);

    const layout = screen.getByTestId("family-tree-canvas").closest(".viewer-layout-overlay");
    expect(layout).toHaveClass("viewer-panel-collapsed");
    expect(screen.queryByRole("button", { name: "Свернуть" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Открыть карточку человека: Demo Person" }));

    expect(layout).toHaveClass("viewer-panel-open");
    expect(screen.queryByRole("button", { name: "Свернуть" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Свернуть карточку человека: Demo Person" }));

    expect(layout).toHaveClass("viewer-panel-collapsed");
  });

  it("selecting a person from the tree opens the inspector and keeps it open for later selections", () => {
    render(<TreeViewerClient snapshot={createSnapshot()} />);

    const layout = screen.getByTestId("family-tree-canvas").closest(".viewer-layout-overlay");
    expect(layout).toHaveClass("viewer-panel-collapsed");

    fireEvent.click(screen.getByRole("button", { name: "Выбрать Second Person" }));

    expect(layout).toHaveClass("viewer-panel-open");
    expect(screen.getByText("Second bio")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-selected-person")).toHaveTextContent("person-2");

    fireEvent.click(screen.getByRole("button", { name: "Выбрать Demo Person" }));

    expect(layout).toHaveClass("viewer-panel-open");
    expect(screen.getByText("Bio")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-selected-person")).toHaveTextContent("person-1");
  });

  it("does not render an empty collapsed tab when no selected person exists", () => {
    const snapshot = createSnapshot();
    snapshot.tree.root_person_id = null;
    snapshot.people = [];
    snapshot.media = [];
    snapshot.personMedia = [];

    render(<TreeViewerClient snapshot={snapshot} />);

    const layout = screen.getByTestId("family-tree-canvas").closest(".viewer-layout-overlay");
    expect(layout).toHaveClass("viewer-panel-open");
    expect(screen.queryByLabelText(/Открыть карточку человека:/)).not.toBeInTheDocument();
    expect(screen.getByText("Выберите человека, чтобы посмотреть его данные.")).toBeInTheDocument();
  });

  it("shows avatar preview for the selected person in the info rail", () => {
    render(<TreeViewerClient snapshot={createSnapshot()} />);

    expect(screen.getByAltText("Портрет: Demo Person")).toHaveAttribute("src", "/api/media/media-1?variant=thumb");
    expect(screen.getByTestId("person-media-gallery")).toHaveTextContent("avatar:media-1; media:Portrait");
    expect(screen.getByText("1990")).toBeInTheDocument();
    expect(screen.queryByText("1990 — ?")).not.toBeInTheDocument();
  });

  it("hides the summary avatar tile when the preview image fails to load", () => {
    render(<TreeViewerClient snapshot={createSnapshot()} />);

    const avatarImage = screen.getByAltText("Портрет: Demo Person");
    fireEvent.error(avatarImage);

    expect(screen.queryByAltText("Портрет: Demo Person")).not.toBeInTheDocument();
    expect(screen.getByText("Bio")).toBeInTheDocument();
  });

  it("renders documents as a separate list and keeps them out of the visual media gallery", () => {
    const snapshot = createSnapshot();
    snapshot.media = [
      ...snapshot.media,
      {
        id: "media-doc-1",
        tree_id: "tree-1",
        kind: "document",
        provider: "object_storage",
        visibility: "members",
        storage_path: "trees/tree-1/media/document/media-doc-1/archive.pdf",
        external_url: null,
        title: "Family Archive.pdf",
        caption: null,
        mime_type: "application/pdf",
        size_bytes: 4096,
        preview_status: null,
        preview_error: null,
        preview_attempt_count: 0,
        preview_claimed_at: null,
        created_by: null,
        created_at: "2026-03-09T00:00:00.000Z",
      },
    ];
    snapshot.personMedia = [
      ...snapshot.personMedia,
      {
        id: "pm-doc-1",
        person_id: "person-1",
        media_id: "media-doc-1",
        is_primary: false,
      },
    ];

    render(<TreeViewerClient snapshot={snapshot} />);

    expect(screen.getByTestId("person-media-gallery")).toHaveTextContent("media:Portrait");
    expect(screen.queryByTestId("person-media-gallery")).not.toHaveTextContent("Family Archive.pdf");
    expect(screen.getByRole("heading", { name: "Документы" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Family Archive\.pdf/i })).toHaveAttribute("href", "/api/media/media-doc-1");
    expect(screen.getByText("4 KB")).toBeInTheDocument();
    expect(screen.queryByText("Family Archive.pdfPDF")).not.toBeInTheDocument();
  });

  it("falls back to the original avatar route for legacy photos without variants", () => {
    const snapshot = createSnapshot();
    snapshot.media = [
      {
        ...snapshot.media[0],
        created_at: "2026-03-07T00:00:00.000Z",
      },
    ];

    render(<TreeViewerClient snapshot={snapshot} />);

    expect(screen.getByAltText("Портрет: Demo Person")).toHaveAttribute("src", "/api/media/media-1");
  });
});
