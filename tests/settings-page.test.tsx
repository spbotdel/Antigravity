import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "@/app/tree/[slug]/settings/page";
import { AppError } from "@/lib/server/errors";

const mocks = vi.hoisted(() => ({
  getTreeSettingsPageData: vi.fn(),
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

vi.mock("@/components/settings/tree-settings-form", () => ({
  TreeSettingsForm: ({
    tree,
    people,
    initialBaseUrl,
  }: {
    tree: { title: string };
    people: Array<{ id: string }>;
    initialBaseUrl: string;
  }) => <div data-testid="tree-settings-form">title:{tree.title};people:{people.length};base:{initialBaseUrl}</div>,
}));

vi.mock("@/lib/server/repository", () => ({
  getTreeSettingsPageData: mocks.getTreeSettingsPageData,
}));

describe("settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the settings workspace for actors who can manage settings", async () => {
    mocks.getTreeSettingsPageData.mockResolvedValue({
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
      people: [{ id: "person-1" }, { id: "person-2" }],
    });

    render(
      await SettingsPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({}),
      })
    );

    expect(mocks.getTreeSettingsPageData).toHaveBeenCalledWith("demo-family", { shareToken: null });
    expect(screen.getByRole("heading", { name: "Demo Family" })).toBeInTheDocument();
    expect(screen.getByText("Закрытое")).toBeInTheDocument();
    expect(screen.getByText("2 человек")).toBeInTheDocument();
    expect(screen.getByTestId("tree-nav")).toHaveTextContent("share:none;edit:true");
    expect(screen.getByTestId("tree-settings-form")).toHaveTextContent("title:Demo Family;people:2;base:");
  });

  it("redirects share-link viewers back to the viewer page", async () => {
    mocks.getTreeSettingsPageData.mockResolvedValue({
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
    });

    await expect(
      SettingsPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ share: "family-token" }),
      })
    ).rejects.toThrow("redirect:/tree/demo-family?share=family-token");
  });

  it("redirects when the lightweight settings loader throws 403", async () => {
    mocks.getTreeSettingsPageData.mockRejectedValue(new AppError(403, "forbidden"));

    await expect(
      SettingsPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ share: "family-token" }),
      })
    ).rejects.toThrow("redirect:/tree/demo-family?share=family-token");
  });
});
