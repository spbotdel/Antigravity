import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TreeViewerClient } from "@/components/tree/tree-viewer-client";
import type { TreeSnapshot } from "@/lib/types";

vi.mock("@/components/tree/family-tree-canvas", () => ({
  FamilyTreeCanvas: () => <div data-testid="family-tree-canvas" />
}));

vi.mock("@/components/tree/person-media-gallery", () => ({
  PersonMediaGallery: ({ avatarMediaId }: { avatarMediaId?: string | null }) => (
    <div data-testid="person-media-gallery">avatar:{avatarMediaId || "none"}</div>
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
    expect(screen.getByTestId("person-media-gallery")).toHaveTextContent("avatar:media-1");
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
