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

import { acceptInvite } from "@/lib/server/repository";

describe("acceptInvite", () => {
  const inviteBase = {
    id: "invite-1",
    tree_id: "tree-1",
    email: "pending@example.com",
    role: "viewer" as const,
    invite_method: "link" as const,
    token_hash: "hashed-token",
    expires_at: "2099-03-20T12:00:00.000Z",
    accepted_at: null,
    created_by: "user-owner",
    created_at: "2026-03-09T00:00:00.000Z",
  };
  const activeMembershipQuery = "tree_memberships?select=*&tree_id=eq.tree-1&user_id=eq.user-accepted&status=eq.active&limit=1";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUserId.mockResolvedValue("user-accepted");
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.fetchSupabaseAdminRestJsonWithHeaders.mockResolvedValue({
      data: [
        {
          id: "membership-1",
          tree_id: "tree-1",
          user_id: "user-accepted",
          role: "viewer",
          status: "active",
          created_at: "2026-03-09T00:00:00.000Z",
        },
      ],
      headers: {},
    });
  });

  it("upserts membership and returns the nested invite tree slug without extra tree lookup", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string, init?: { method?: string }) => {
      if (pathWithQuery.startsWith("tree_invites?select=*,tree:trees!inner(id,slug)&token_hash=eq.")) {
        return [
          {
            ...inviteBase,
            tree: {
              id: "tree-1",
              slug: "demo-family",
            },
          },
        ];
      }

      if (pathWithQuery === activeMembershipQuery) {
        return [];
      }

      if (pathWithQuery === "audit_log" && init?.method === "POST") {
        return [];
      }

      if (pathWithQuery === `tree_invites?id=eq.${inviteBase.id}&select=*` && init?.method === "PATCH") {
        return [{ ...inviteBase, accepted_at: "2026-03-10T12:00:00.000Z" }];
      }

      throw new Error(`Unexpected fetchSupabaseAdminRestJson call: ${pathWithQuery}`);
    });

    const result = await acceptInvite("long-enough-token");

    expect(result).toEqual({ slug: "demo-family" });
    expect(mocks.fetchSupabaseAdminRestJsonWithHeaders).toHaveBeenCalledWith(
      "tree_memberships?on_conflict=tree_id,user_id",
      {
        method: "POST",
        body: {
          tree_id: "tree-1",
          user_id: "user-accepted",
          role: "viewer",
          status: "active",
        },
        headers: {
          prefer: "resolution=merge-duplicates,return=representation",
        },
      },
    );

    const fetchCalls = mocks.fetchSupabaseAdminRestJson.mock.calls.map((call) => call[0]);
    expect(fetchCalls).toContain(activeMembershipQuery);
    expect(fetchCalls).not.toContain("trees?select=*&id=eq.tree-1");
  });

  it("falls back to tree lookup when invite relation does not include slug", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string, init?: { method?: string }) => {
      if (pathWithQuery.startsWith("tree_invites?select=*,tree:trees!inner(id,slug)&token_hash=eq.")) {
        return [inviteBase];
      }

      if (pathWithQuery === activeMembershipQuery) {
        return [];
      }

      if (pathWithQuery === `tree_invites?id=eq.${inviteBase.id}&select=*` && init?.method === "PATCH") {
        return [{ ...inviteBase, accepted_at: "2026-03-10T12:00:00.000Z" }];
      }

      if (pathWithQuery === "trees?select=*&id=eq.tree-1&limit=1") {
        return [
          {
            id: "tree-1",
            owner_user_id: "user-owner",
            slug: "fallback-family",
            title: "Fallback Family",
            description: null,
            visibility: "private",
            root_person_id: null,
            created_at: "2026-03-09T00:00:00.000Z",
            updated_at: "2026-03-09T00:00:00.000Z",
          },
        ];
      }

      if (pathWithQuery === "audit_log" && init?.method === "POST") {
        return [];
      }

      throw new Error(`Unexpected fetchSupabaseAdminRestJson call: ${pathWithQuery}`);
    });

    const result = await acceptInvite("long-enough-token");

    expect(result).toEqual({ slug: "fallback-family" });
    expect(mocks.fetchSupabaseAdminRestJson.mock.calls.map((call) => call[0])).toContain("trees?select=*&id=eq.tree-1&limit=1");
  });

  it("preserves an existing stronger role when accepting a weaker invite", async () => {
    mocks.fetchSupabaseAdminRestJsonWithHeaders.mockResolvedValue({
      data: [
        {
          id: "membership-owner",
          tree_id: "tree-1",
          user_id: "user-accepted",
          role: "owner",
          status: "active",
          created_at: "2026-03-09T00:00:00.000Z",
        },
      ],
      headers: {},
    });

    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string, init?: { method?: string }) => {
      if (pathWithQuery.startsWith("tree_invites?select=*,tree:trees!inner(id,slug)&token_hash=eq.")) {
        return [
          {
            ...inviteBase,
            tree: {
              id: "tree-1",
              slug: "demo-family",
            },
          },
        ];
      }

      if (pathWithQuery === activeMembershipQuery) {
        return [
          {
            id: "membership-owner",
            tree_id: "tree-1",
            user_id: "user-accepted",
            role: "owner",
            status: "active",
            created_at: "2026-03-09T00:00:00.000Z",
          },
        ];
      }

      if (pathWithQuery === `tree_invites?id=eq.${inviteBase.id}&select=*` && init?.method === "PATCH") {
        return [{ ...inviteBase, accepted_at: "2026-03-10T12:00:00.000Z" }];
      }

      if (pathWithQuery === "audit_log" && init?.method === "POST") {
        return [];
      }

      throw new Error(`Unexpected fetchSupabaseAdminRestJson call: ${pathWithQuery}`);
    });

    await acceptInvite("long-enough-token");

    expect(mocks.fetchSupabaseAdminRestJsonWithHeaders).toHaveBeenCalledWith(
      "tree_memberships?on_conflict=tree_id,user_id",
      {
        method: "POST",
        body: {
          tree_id: "tree-1",
          user_id: "user-accepted",
          role: "owner",
          status: "active",
        },
        headers: {
          prefer: "resolution=merge-duplicates,return=representation",
        },
      },
    );
  });
});
