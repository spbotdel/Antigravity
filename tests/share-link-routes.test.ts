import { beforeEach, describe, expect, it, vi } from "vitest";

const createShareLink = vi.fn();
const listShareLinks = vi.fn();
const revealShareLink = vi.fn();
const revokeShareLink = vi.fn();

vi.mock("@/lib/server/repository", () => ({
  createShareLink,
  listShareLinks,
  revealShareLink,
  revokeShareLink,
}));

describe("share-link routes", () => {
  beforeEach(() => {
    createShareLink.mockReset();
    listShareLinks.mockReset();
    revealShareLink.mockReset();
    revokeShareLink.mockReset();
  });

  it("returns the share-link URL payload from /api/share-links", async () => {
    const { POST } = await import("@/app/api/share-links/route");
    createShareLink.mockResolvedValue({
      shareLink: { id: crypto.randomUUID() },
      token: "share-token",
      url: "http://localhost:3000/tree/demo-family?share=share-token",
    });

    const response = await POST(
      new Request("http://localhost/api/share-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          treeId: crypto.randomUUID(),
          treeSlug: "demo-family",
          label: "Родные из РФ",
          expiresInDays: 14,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(createShareLink).toHaveBeenCalledWith({
      treeId: expect.any(String),
      treeSlug: "demo-family",
      label: "Родные из РФ",
      expiresInDays: 14,
    });
    expect(payload.url).toContain("?share=");
    expect(payload.message).toBe("Семейная ссылка создана.");
  });

  it("returns share links from /api/share-links", async () => {
    const { GET } = await import("@/app/api/share-links/route");
    const treeId = crypto.randomUUID();
    listShareLinks.mockResolvedValue([
      {
        id: "share-1",
        tree_id: treeId,
        label: "Родные из РФ",
        token_hash: "hash",
        expires_at: "2026-03-20T12:00:00.000Z",
        revoked_at: null,
        last_accessed_at: null,
        created_by: "user-owner",
        created_at: "2026-03-09T00:00:00.000Z",
      },
    ]);

    const response = await GET(new Request(`http://localhost/api/share-links?treeId=${treeId}`));
    const payload = await response.json();

    expect(listShareLinks).toHaveBeenCalledWith(treeId);
    expect(response.status).toBe(200);
    expect(payload.shareLinks).toHaveLength(1);
    expect(payload.shareLinks[0].label).toBe("Родные из РФ");
  });

  it("revokes a share link via /api/share-links/[shareLinkId]", async () => {
    const { DELETE } = await import("@/app/api/share-links/[shareLinkId]/route");
    revokeShareLink.mockResolvedValue({
      id: "share-1",
      revoked_at: "2026-03-10T12:00:00.000Z",
    });

    const response = await DELETE(new Request("http://localhost/api/share-links/share-1", { method: "DELETE" }), {
      params: Promise.resolve({ shareLinkId: "share-1" }),
    });
    const payload = await response.json();

    expect(revokeShareLink).toHaveBeenCalledWith("share-1");
    expect(response.status).toBe(200);
    expect(payload.message).toBe("Семейная ссылка отозвана.");
  });

  it("reveals a share link via /api/share-links/[shareLinkId]", async () => {
    const { GET } = await import("@/app/api/share-links/[shareLinkId]/route");
    revealShareLink.mockResolvedValue({
      shareLink: {
        id: "share-1",
        tree_id: crypto.randomUUID(),
        label: "Родные из РФ",
      },
      canReveal: true,
      url: "http://localhost:3000/tree/demo-family?share=revealed-token",
      message: "Семейная ссылка загружена.",
    });

    const response = await GET(new Request("http://localhost/api/share-links/share-1"), {
      params: Promise.resolve({ shareLinkId: "share-1" }),
    });
    const payload = await response.json();

    expect(revealShareLink).toHaveBeenCalledWith("share-1");
    expect(response.status).toBe(200);
    expect(payload.canReveal).toBe(true);
    expect(payload.url).toContain("?share=");
  });
});
