import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMediaAccess: vi.fn(),
  getMediaSummary: vi.fn(),
  deleteMedia: vi.fn(),
  setPrimaryPersonMedia: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/server/repository", () => ({
  resolveMediaAccess: mocks.resolveMediaAccess,
  getMediaSummary: mocks.getMediaSummary,
  deleteMedia: mocks.deleteMedia,
  setPrimaryPersonMedia: mocks.setPrimaryPersonMedia,
}));

vi.mock("@/lib/server/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/server/errors", () => ({
  toErrorResponse: (error: unknown) =>
    Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    ),
}));

vi.mock("@/lib/validators/media", () => ({
  setPrimaryPersonMediaSchema: {
    parse: (value: unknown) => value,
  },
}));

import { GET, __clearMediaThumbResolutionCacheForTests } from "@/app/api/media/[mediaId]/route";

describe("media thumb route cache", () => {
  beforeEach(() => {
    __clearMediaThumbResolutionCacheForTests();
    vi.clearAllMocks();
    mocks.resolveMediaAccess.mockResolvedValue({
      kind: "photo",
      url: "https://example.com/thumb.webp",
      cacheContext: {
        treeId: "tree-1",
        effectiveVisibility: "members",
        accessSource: "membership",
      },
    });
  });

  it("caches thumb redirects for the same authenticated actor scope", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "user-1@example.com" });

    const request = new Request("http://localhost/api/media/media-1?variant=thumb");

    const firstResponse = await GET(request, { params: Promise.resolve({ mediaId: "media-1" }) });
    const secondResponse = await GET(request, { params: Promise.resolve({ mediaId: "media-1" }) });

    expect(firstResponse.status).toBe(307);
    expect(secondResponse.status).toBe(307);
    expect(firstResponse.headers.get("location")).toBe("https://example.com/thumb.webp");
    expect(secondResponse.headers.get("location")).toBe("https://example.com/thumb.webp");
    expect(mocks.resolveMediaAccess).toHaveBeenCalledTimes(1);
    expect(mocks.resolveMediaAccess).toHaveBeenCalledWith("media-1", null, "thumb", {
      download: false,
      resolvedUser: { id: "user-1", email: "user-1@example.com" },
    });
  });

  it("separates thumb cache entries by authenticated user scope", async () => {
    mocks.getCurrentUser
      .mockResolvedValueOnce({ id: "user-1", email: "user-1@example.com" })
      .mockResolvedValueOnce({ id: "user-2", email: "user-2@example.com" });

    const request = new Request("http://localhost/api/media/media-1?variant=thumb");

    await GET(request, { params: Promise.resolve({ mediaId: "media-1" }) });
    await GET(request, { params: Promise.resolve({ mediaId: "media-1" }) });

    expect(mocks.resolveMediaAccess).toHaveBeenCalledTimes(2);
  });

  it("separates thumb cache entries by share token for anonymous share-link access", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const firstRequest = new Request("http://localhost/api/media/media-1?variant=thumb&share=share-token-a");
    const secondRequest = new Request("http://localhost/api/media/media-1?variant=thumb&share=share-token-b");

    await GET(firstRequest, { params: Promise.resolve({ mediaId: "media-1" }) });
    await GET(secondRequest, { params: Promise.resolve({ mediaId: "media-1" }) });

    expect(mocks.resolveMediaAccess).toHaveBeenCalledTimes(2);
  });

  it("does not use thumb cache for non-thumb variants", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "user-1@example.com" });

    const request = new Request("http://localhost/api/media/media-1?variant=small");

    await GET(request, { params: Promise.resolve({ mediaId: "media-1" }) });
    await GET(request, { params: Promise.resolve({ mediaId: "media-1" }) });

    expect(mocks.resolveMediaAccess).toHaveBeenCalledTimes(2);
    expect(mocks.resolveMediaAccess).toHaveBeenNthCalledWith(1, "media-1", null, "small", { download: false });
    expect(mocks.resolveMediaAccess).toHaveBeenNthCalledWith(2, "media-1", null, "small", { download: false });
  });
});
