import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MembersPage from "@/app/tree/[slug]/members/page";
import { AppError } from "@/lib/server/errors";

const mocks = vi.hoisted(() => ({
  getTreeMembersPageData: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/components/layout/tree-nav", () => ({
  TreeNav: () => <div data-testid="tree-nav" />,
}));

vi.mock("@/components/members/member-management-panel", () => ({
  MemberManagementPanel: ({
    memberships,
    invites,
    shareLinks,
  }: {
    memberships: Array<{ id: string }>;
    invites: Array<{ id: string }>;
    shareLinks: Array<{ id: string }>;
  }) => (
    <div data-testid="member-management-panel">
      memberships:{memberships.length};invites:{invites.length};share-links:{shareLinks.length}
    </div>
  ),
}));

vi.mock("@/lib/server/repository", () => ({
  getTreeMembersPageData: mocks.getTreeMembersPageData,
}));

describe("members page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the members workspace for actors who can manage members", async () => {
    mocks.getTreeMembersPageData.mockResolvedValue({
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
      memberships: [
        { id: "membership-owner", status: "active" },
        { id: "membership-admin", status: "active" },
      ],
      invites: [{ id: "invite-pending", accepted_at: null }],
      shareLinks: [
        { id: "share-active", revoked_at: null, expires_at: "2099-03-20T12:00:00.000Z" },
      ],
    });

    render(
      await MembersPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({}),
      })
    );

    expect(mocks.getTreeMembersPageData).toHaveBeenCalledWith("demo-family", { shareToken: null });
    expect(screen.getByRole("heading", { name: "Demo Family" })).toBeInTheDocument();
    expect(screen.getByText("2 активных")).toBeInTheDocument();
    expect(screen.getByText("1 ждут ответа")).toBeInTheDocument();
    expect(screen.getByText("1 семейных ссылок")).toBeInTheDocument();
    expect(screen.getByTestId("member-management-panel")).toHaveTextContent("memberships:2;invites:1;share-links:1");
  });

  it("redirects share-link viewers back to the viewer page", async () => {
    mocks.getTreeMembersPageData.mockResolvedValue({
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
      memberships: [],
      invites: [],
      shareLinks: [],
    });

    await expect(
      MembersPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ share: "family-token" }),
      })
    ).rejects.toThrow("redirect:/tree/demo-family?share=family-token");
  });

  it("redirects to the viewer page when lightweight page data throws 403", async () => {
    mocks.getTreeMembersPageData.mockRejectedValue(new AppError(403, "forbidden"));

    await expect(
      MembersPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ share: "family-token" }),
      })
    ).rejects.toThrow("redirect:/tree/demo-family?share=family-token");
  });
});
