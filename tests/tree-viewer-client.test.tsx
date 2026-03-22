import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TreeViewerClient } from "@/components/tree/tree-viewer-client";
import type { TreeSnapshot } from "@/lib/types";

vi.mock("@/components/tree/family-tree-canvas", () => ({
  FamilyTreeCanvas: () => <div data-testid="family-tree-canvas" />
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
    ],
    parentLinks: [],
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
  it("shows avatar preview for the selected person in the info rail", () => {
    render(<TreeViewerClient snapshot={createSnapshot()} />);

    expect(screen.getByAltText("Портрет: Demo Person")).toHaveAttribute("src", "/api/media/media-1?variant=thumb");
    expect(screen.getByTestId("person-media-gallery")).toHaveTextContent("avatar:media-1; media:Portrait");
    expect(screen.getByText("1990")).toBeInTheDocument();
    expect(screen.queryByText("1990 — ?")).not.toBeInTheDocument();
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
