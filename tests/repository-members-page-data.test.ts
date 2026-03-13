import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSupabaseAdminRestJson: vi.fn(),
  fetchSupabaseAdminRestBatchJson: vi.fn(),
  fetchSupabaseAdminRestJsonWithHeaders: vi.fn(),
  parsePowerShellJsonStdout: vi.fn(),
  getCurrentUser: vi.fn(),
  requireAuthenticatedUserId: vi.fn(),
  buildViewerActor: vi.fn(),
  canViewTree: vi.fn(),
  hasRequiredRole: vi.fn(),
  canSeeMedia: vi.fn(),
}));

vi.mock("@/lib/supabase/admin-rest", () => ({
  fetchSupabaseAdminRestJson: mocks.fetchSupabaseAdminRestJson,
  fetchSupabaseAdminRestBatchJson: mocks.fetchSupabaseAdminRestBatchJson,
  fetchSupabaseAdminRestJsonWithHeaders: mocks.fetchSupabaseAdminRestJsonWithHeaders,
  parsePowerShellJsonStdout: mocks.parsePowerShellJsonStdout,
}));

vi.mock("@/lib/server/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  requireAuthenticatedUserId: mocks.requireAuthenticatedUserId,
}));

vi.mock("@/lib/permissions", () => ({
  buildViewerActor: mocks.buildViewerActor,
  canViewTree: mocks.canViewTree,
  hasRequiredRole: mocks.hasRequiredRole,
  canSeeMedia: mocks.canSeeMedia,
}));

import { getTreeMembersPageData } from "@/lib/server/repository";

const SHARE_LINK_PUBLIC_SELECT = "id,tree_id,label,token_hash,expires_at,revoked_at,last_accessed_at,created_by,created_at";

describe("getTreeMembersPageData", () => {
  const tree = {
    id: "tree-1",
    owner_user_id: "user-owner",
    slug: "demo-family",
    title: "Demo Family",
    description: null,
    visibility: "private",
    root_person_id: null,
    created_at: "2026-03-09T00:00:00.000Z",
    updated_at: "2026-03-09T00:00:00.000Z",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-owner" });
    mocks.canViewTree.mockReturnValue(true);
    mocks.hasRequiredRole.mockImplementation((role: string, allowedRoles: string[]) => allowedRoles.includes(role));
    mocks.canSeeMedia.mockReturnValue(true);
    mocks.buildViewerActor.mockImplementation((userId: string | null, role: string | null, extras?: { accessSource?: string; shareLinkId?: string | null }) => ({
      userId,
      role,
      isAuthenticated: Boolean(userId),
      accessSource: extras?.accessSource ?? "membership",
      shareLinkId: extras?.shareLinkId ?? null,
      canEdit: role === "owner" || role === "admin",
      canManageMembers: role === "owner" || role === "admin",
      canManageSettings: role === "owner",
      canReadAudit: role === "owner",
    }));
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string) => {
      if (pathWithQuery.startsWith("trees?select=*&slug=eq.demo-family")) {
        return [tree];
      }

      if (pathWithQuery.includes("tree_memberships?select=*") && pathWithQuery.includes("user_id=eq.user-owner")) {
        return [
          {
            id: "membership-owner",
            tree_id: tree.id,
            user_id: "user-owner",
            role: "owner",
            status: "active",
            created_at: "2026-03-09T00:00:00.000Z",
          },
        ];
      }

      return [];
    });
  });

  it("loads memberships, invites, and share links in one batch for members page", async () => {
    mocks.fetchSupabaseAdminRestBatchJson.mockResolvedValue([
      [
        {
          id: "membership-admin",
          tree_id: tree.id,
          user_id: "user-admin",
          role: "admin",
          status: "active",
          created_at: "2026-03-09T00:00:00.000Z",
        },
      ],
      [
        {
          id: "invite-1",
          tree_id: tree.id,
          email: "pending@example.com",
          role: "viewer",
          invite_method: "link",
          token_hash: "hash",
          expires_at: "2026-03-20T12:00:00.000Z",
          accepted_at: null,
          created_by: "user-owner",
          created_at: "2026-03-09T00:00:00.000Z",
        },
      ],
      [
        {
          id: "share-1",
          tree_id: tree.id,
          label: "Семейная ссылка",
          token_hash: "hash",
          expires_at: "2026-03-20T12:00:00.000Z",
          revoked_at: null,
          last_accessed_at: null,
          created_by: "user-owner",
          created_at: "2026-03-09T00:00:00.000Z",
        },
      ],
    ]);

    const result = await getTreeMembersPageData("demo-family");

    expect(mocks.fetchSupabaseAdminRestBatchJson).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSupabaseAdminRestBatchJson).toHaveBeenCalledWith([
      {
        pathWithQuery: "tree_memberships?select=*&tree_id=eq.tree-1&order=created_at.asc",
      },
      {
        pathWithQuery: "tree_invites?select=*&tree_id=eq.tree-1&order=created_at.desc",
      },
      {
        pathWithQuery: `tree_share_links?select=${SHARE_LINK_PUBLIC_SELECT}&tree_id=eq.tree-1&order=created_at.desc`,
      },
    ]);
    expect(result.memberships).toHaveLength(1);
    expect(result.invites).toHaveLength(1);
    expect(result.shareLinks).toHaveLength(1);
  });

  it("falls back to memberships and invites only when share-links schema is unavailable", async () => {
    mocks.fetchSupabaseAdminRestBatchJson
      .mockRejectedValueOnce(new Error("Could not find the table 'public.tree_share_links' in the schema cache"))
      .mockResolvedValueOnce([
        [
          {
            id: "membership-admin",
            tree_id: tree.id,
            user_id: "user-admin",
            role: "admin",
            status: "active",
            created_at: "2026-03-09T00:00:00.000Z",
          },
        ],
        [
          {
            id: "invite-1",
            tree_id: tree.id,
            email: "pending@example.com",
            role: "viewer",
            invite_method: "link",
            token_hash: "hash",
            expires_at: "2026-03-20T12:00:00.000Z",
            accepted_at: null,
            created_by: "user-owner",
            created_at: "2026-03-09T00:00:00.000Z",
          },
        ],
      ]);

    const result = await getTreeMembersPageData("demo-family");

    expect(mocks.fetchSupabaseAdminRestBatchJson).toHaveBeenCalledTimes(2);
    expect(mocks.fetchSupabaseAdminRestBatchJson.mock.calls[0][0]).toHaveLength(3);
    expect(mocks.fetchSupabaseAdminRestBatchJson.mock.calls[1][0]).toEqual([
      {
        pathWithQuery: "tree_memberships?select=*&tree_id=eq.tree-1&order=created_at.asc",
      },
      {
        pathWithQuery: "tree_invites?select=*&tree_id=eq.tree-1&order=created_at.desc",
      },
    ]);
    expect(result.memberships).toHaveLength(1);
    expect(result.invites).toHaveLength(1);
    expect(result.shareLinks).toEqual([]);
  });
});
