import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTreeSnapshot } = vi.hoisted(() => ({
  getTreeSnapshot: vi.fn()
}));

vi.mock("@/components/layout/app-header", () => ({
  AppHeader: ({ mode, showDashboardLink }: { mode: string; showDashboardLink: boolean }) => (
    <div data-testid="app-header" data-mode={mode} data-dashboard-link={String(showDashboardLink)} />
  )
}));

vi.mock("@/components/layout/tree-nav", () => ({
  TreeNav: () => <div data-testid="tree-nav">nav</div>
}));

vi.mock("@/components/tree/tree-viewer-client", () => ({
  TreeViewerClient: () => <div data-testid="tree-viewer-client">viewer</div>
}));

vi.mock("@/lib/server/repository", () => ({
  getTreeSnapshot
}));

import type { ViewerActor } from "@/lib/types";
import TreePage from "@/app/tree/[slug]/page";

function createActor(overrides: Partial<ViewerActor> = {}): ViewerActor {
  return {
    userId: "user-1",
    role: "owner",
    isAuthenticated: true,
    accessSource: "membership",
    shareLinkId: null,
    canEdit: true,
    canManageMembers: true,
    canManageSettings: true,
    canReadAudit: true,
    ...overrides
  };
}

function createSnapshot(actorOverrides: Partial<ViewerActor> = {}) {
  return {
    tree: {
      id: "tree-1",
      owner_user_id: "user-1",
      slug: "family",
      title: "Семья",
      description: null,
      visibility: "private" as const,
      root_person_id: null,
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z"
    },
    actor: createActor(actorOverrides),
    people: [],
    parentLinks: [],
    partnerships: [],
    media: [],
    personMedia: []
  };
}

describe("tree page header wiring", () => {
  beforeEach(() => {
    getTreeSnapshot.mockReset();
  });

  it("shows admin header actions for membership owners", async () => {
    getTreeSnapshot.mockResolvedValue(createSnapshot());

    render(
      await TreePage({
        params: Promise.resolve({ slug: "family" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByTestId("app-header")).toHaveAttribute("data-mode", "admin");
    expect(screen.getByTestId("app-header")).toHaveAttribute("data-dashboard-link", "true");
    expect(screen.getByTestId("tree-nav")).toBeInTheDocument();
  });

  it("shows participant header for membership viewers", async () => {
    getTreeSnapshot.mockResolvedValue(
      createSnapshot({
        role: "viewer",
        canEdit: false,
        canManageMembers: false,
        canManageSettings: false,
        canReadAudit: false
      })
    );

    render(
      await TreePage({
        params: Promise.resolve({ slug: "family" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByTestId("app-header")).toHaveAttribute("data-mode", "participant");
    expect(screen.getByTestId("app-header")).toHaveAttribute("data-dashboard-link", "false");
  });

  it("shows guest header for share-link tree surfaces", async () => {
    getTreeSnapshot.mockResolvedValue(
      createSnapshot({
        role: null,
        accessSource: "share_link",
        shareLinkId: "share-1",
        canEdit: false,
        canManageMembers: false,
        canManageSettings: false,
        canReadAudit: false
      })
    );

    render(
      await TreePage({
        params: Promise.resolve({ slug: "family" }),
        searchParams: Promise.resolve({ share: "secret-token" })
      })
    );

    expect(screen.getByTestId("app-header")).toHaveAttribute("data-mode", "guest");
    expect(screen.getByTestId("app-header")).toHaveAttribute("data-dashboard-link", "false");
    expect(getTreeSnapshot).toHaveBeenCalledWith("family", { shareToken: "secret-token" });
  });

  it("shows guest header for public non-membership tree surfaces", async () => {
    getTreeSnapshot.mockResolvedValue(
      createSnapshot({
        userId: null,
        role: null,
        isAuthenticated: false,
        accessSource: "public",
        canEdit: false,
        canManageMembers: false,
        canManageSettings: false,
        canReadAudit: false
      })
    );

    render(
      await TreePage({
        params: Promise.resolve({ slug: "family" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByTestId("app-header")).toHaveAttribute("data-mode", "guest");
    expect(screen.getByTestId("app-header")).toHaveAttribute("data-dashboard-link", "false");
  });
});
