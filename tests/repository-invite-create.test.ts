import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSupabaseAdminRestJson: vi.fn(),
  fetchSupabaseAdminRestBatchJson: vi.fn(),
  fetchSupabaseAdminRestJsonWithHeaders: vi.fn(),
  parsePowerShellJsonStdout: vi.fn(),
  getCurrentUser: vi.fn(),
  requireAuthenticatedUserId: vi.fn(),
  getBaseUrl: vi.fn(),
  getResendEmailEnv: vi.fn(),
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

vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    ...actual,
    getBaseUrl: mocks.getBaseUrl,
    getResendEmailEnv: mocks.getResendEmailEnv,
  };
});

import { createInvite } from "@/lib/server/repository";

describe("createInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUserId.mockResolvedValue("user-owner");
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getBaseUrl.mockReturnValue("http://localhost:3000");
    mocks.getResendEmailEnv.mockReturnValue(null);

    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string, init?: { method?: string }) => {
      if (pathWithQuery === "tree_invites" && init?.method === "POST") {
        return [
          {
            id: "invite-1",
            tree_id: "tree-1",
            email: "helper@example.com",
            role: "admin",
            invite_method: "email",
            token_hash: "hash",
            expires_at: "2099-03-20T12:00:00.000Z",
            accepted_at: null,
            created_by: "user-owner",
            created_at: "2026-03-13T00:00:00.000Z",
          },
        ];
      }

      if (pathWithQuery === "audit_log" && init?.method === "POST") {
        return [];
      }

      if (pathWithQuery === "trees?select=*&id=eq.tree-1&limit=1") {
        return [
          {
            id: "tree-1",
            owner_user_id: "user-owner",
            slug: "demo-family",
            title: "Demo Family",
            description: null,
            visibility: "private",
            root_person_id: null,
            created_at: "2026-03-09T00:00:00.000Z",
            updated_at: "2026-03-09T00:00:00.000Z",
          },
        ];
      }

      if (pathWithQuery === "tree_memberships?select=*&tree_id=eq.tree-1&user_id=eq.user-owner&status=eq.active&limit=1") {
        return [
          {
            id: "membership-owner",
            tree_id: "tree-1",
            user_id: "user-owner",
            role: "owner",
            status: "active",
            created_at: "2026-03-09T00:00:00.000Z",
          },
        ];
      }

      throw new Error(`Unexpected fetchSupabaseAdminRestJson call: ${pathWithQuery}`);
    });
  });

  it("keeps email invites usable when Resend is not configured", async () => {
    const result = await createInvite({
      treeId: "tree-1",
      role: "admin",
      inviteMethod: "email",
      email: "helper@example.com",
      expiresInDays: 7,
    });

    expect(result.url).toContain("/auth/accept-invite?token=");
    expect(result.deliveryStatus).toBe("skipped");
    expect(result.deliveryMessage).toContain("Resend пока не настроен");
  });

  it("reports a sent status when Resend accepts the email", async () => {
    mocks.getResendEmailEnv.mockReturnValue({
      apiKey: "resend-key",
      fromEmail: "noreply@example.com",
      replyTo: "reply@example.com",
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createInvite({
      treeId: "tree-1",
      role: "admin",
      inviteMethod: "email",
      email: "helper@example.com",
      expiresInDays: 7,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer resend-key",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(result.deliveryStatus).toBe("sent");
    expect(result.deliveryMessage).toBe("Письмо отправлено на helper@example.com.");
  });
});
