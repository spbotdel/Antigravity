import { beforeEach, describe, expect, it, vi } from "vitest";

const createInvite = vi.fn();
const acceptInvite = vi.fn();
const revokeInvite = vi.fn();

vi.mock("@/lib/server/repository", () => ({
  createInvite,
  acceptInvite,
  revokeInvite,
}));

describe("invite routes", () => {
  beforeEach(() => {
    createInvite.mockReset();
    acceptInvite.mockReset();
    revokeInvite.mockReset();
  });

  it("returns the invite URL payload from /api/invites", async () => {
    const { POST } = await import("@/app/api/invites/route");
    createInvite.mockResolvedValue({
      invite: { id: crypto.randomUUID() },
      token: "invite-token",
      url: "http://localhost:3000/auth/accept-invite?token=invite-token",
      deliveryStatus: "sent",
      deliveryMessage: "Письмо отправлено на viewer@example.com.",
    });

    const response = await POST(
      new Request("http://localhost/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          treeId: crypto.randomUUID(),
          role: "viewer",
          inviteMethod: "link",
          email: "viewer@example.com",
          expiresInDays: 7,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.url).toContain("accept-invite");
    expect(payload.deliveryStatus).toBe("sent");
    expect(payload.deliveryMessage).toBe("Письмо отправлено на viewer@example.com.");
    expect(payload.message).toBe("Приглашение создано.");
  });

  it("revokes a pending invite via /api/invites/[inviteId]", async () => {
    const { DELETE } = await import("@/app/api/invites/[inviteId]/route");

    const response = await DELETE(new Request("http://localhost/api/invites/invite-1", { method: "DELETE" }), {
      params: Promise.resolve({ inviteId: "invite-1" }),
    });
    const payload = await response.json();

    expect(revokeInvite).toHaveBeenCalledWith("invite-1");
    expect(response.status).toBe(200);
    expect(payload.message).toBe("Приглашение отозвано.");
  });

  it("accepts invite tokens through /api/invites/accept", async () => {
    const { POST } = await import("@/app/api/invites/accept/route");
    acceptInvite.mockResolvedValue({ slug: "demo-tree" });

    const response = await POST(
      new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "long-enough-token-value" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.slug).toBe("demo-tree");
    expect(payload.message).toBe("Приглашение принято.");
  });
});
