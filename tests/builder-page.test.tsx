import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BuilderPage from "@/app/tree/[slug]/builder/page";
import { AppError } from "@/lib/server/errors";

const mocks = vi.hoisted(() => ({
  getBuilderSnapshot: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/components/layout/tree-nav", () => ({
  TreeNav: ({
    shareToken,
    canEdit,
  }: {
    shareToken?: string | null;
    canEdit: boolean;
  }) => <div data-testid="tree-nav">share:{shareToken || "none"};edit:{String(canEdit)}</div>,
}));

vi.mock("@/components/tree/builder-workspace", () => ({
  BuilderWorkspace: ({
    snapshot,
    mediaLoaded,
  }: {
    snapshot: { tree: { title: string } };
    mediaLoaded?: boolean;
  }) => <div data-testid="builder-workspace">title:{snapshot.tree.title};mediaLoaded:{String(mediaLoaded)}</div>,
}));

vi.mock("@/lib/server/repository", () => ({
  getBuilderSnapshot: mocks.getBuilderSnapshot,
}));

describe("builder page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the builder workspace for editors", async () => {
    mocks.getBuilderSnapshot.mockResolvedValue({
      tree: {
        id: "tree-1",
        owner_user_id: "user-1",
        slug: "demo-family",
        title: "Demo Family",
        description: null,
        visibility: "private",
        root_person_id: null,
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
      people: [],
      parentLinks: [],
      partnerships: [],
      media: [],
      personMedia: [],
    });

    render(
      await BuilderPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({}),
      })
    );

    expect(mocks.getBuilderSnapshot).toHaveBeenCalledWith("demo-family", { shareToken: null });
    expect(screen.getByRole("heading", { name: "Demo Family" })).toBeInTheDocument();
    expect(screen.getByTestId("tree-nav")).toHaveTextContent("share:none;edit:true");
    expect(screen.getByTestId("builder-workspace")).toHaveTextContent("title:Demo Family;mediaLoaded:false");
  });

  it("redirects share-link viewers back to the tree viewer", async () => {
    mocks.getBuilderSnapshot.mockResolvedValue({
      tree: {
        id: "tree-1",
        owner_user_id: "user-1",
        slug: "demo-family",
        title: "Demo Family",
        description: null,
        visibility: "private",
        root_person_id: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
      actor: {
        userId: null,
        role: null,
        isAuthenticated: false,
        accessSource: "share_link",
        shareLinkId: "share-1",
        canEdit: false,
        canManageMembers: false,
        canManageSettings: false,
        canReadAudit: false,
      },
      people: [],
      parentLinks: [],
      partnerships: [],
      media: [],
      personMedia: [],
    });

    await expect(
      BuilderPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ share: "family-token" }),
      })
    ).rejects.toThrow("redirect:/tree/demo-family?share=family-token");
  });

  it("redirects to the viewer page when the builder snapshot throws 403", async () => {
    mocks.getBuilderSnapshot.mockRejectedValue(new AppError(403, "forbidden"));

    await expect(
      BuilderPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ share: "family-token" }),
      })
    ).rejects.toThrow("redirect:/tree/demo-family?share=family-token");
  });
});
