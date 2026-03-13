import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSupabaseAdminRestJson: vi.fn(),
  fetchSupabaseAdminRestBatchJson: vi.fn(),
  fetchSupabaseAdminRestJsonWithHeaders: vi.fn(),
  parsePowerShellJsonStdout: vi.fn(),
  getCurrentUser: vi.fn(),
  requireAuthenticatedUserId: vi.fn(),
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

import { getDashboardBootstrap, listUserTrees } from "@/lib/server/repository";

describe("dashboard repository helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads user dashboard trees with one membership-to-tree relation query", async () => {
    mocks.fetchSupabaseAdminRestJson.mockResolvedValue([
      {
        id: "membership-owner",
        tree_id: "tree-1",
        user_id: "user-1",
        role: "owner",
        status: "active",
        created_at: "2026-03-09T00:00:00.000Z",
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
      },
    ]);

    const items = await listUserTrees("user-1");

    expect(mocks.fetchSupabaseAdminRestJson).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSupabaseAdminRestJson).toHaveBeenCalledWith(
      "tree_memberships?select=*,tree:trees!inner(*)&user_id=eq.user-1&status=eq.active&order=created_at.asc",
    );
    expect(items).toEqual([
      {
        membership: {
          id: "membership-owner",
          tree_id: "tree-1",
          user_id: "user-1",
          role: "owner",
          status: "active",
          created_at: "2026-03-09T00:00:00.000Z",
        },
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
      },
    ]);
  });

  it("uses current user bootstrap and returns the preloaded tree items", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
    });
    mocks.fetchSupabaseAdminRestJson.mockResolvedValue([
      {
        id: "membership-owner",
        tree_id: "tree-1",
        user_id: "user-1",
        role: "owner",
        status: "active",
        created_at: "2026-03-09T00:00:00.000Z",
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
      },
    ]);

    const result = await getDashboardBootstrap();

    expect(result.user).toEqual({
      id: "user-1",
      email: "owner@example.com",
    });
    expect(result.trees).toHaveLength(1);
    expect(result.trees[0]?.tree.slug).toBe("demo-family");
  });
});
