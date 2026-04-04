import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTreeMediaThumbUrls: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/server/repository", () => ({
  resolveTreeMediaThumbUrls: mocks.resolveTreeMediaThumbUrls,
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

import { POST, __clearMediaThumbBatchRouteCacheForTests } from "@/app/api/media/thumbs/route";

describe("media thumb batch route", () => {
  beforeEach(() => {
    __clearMediaThumbBatchRouteCacheForTests();
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "user-1@example.com" });
    mocks.resolveTreeMediaThumbUrls.mockResolvedValue({
      "media-a": "https://example.com/thumb-a.webp",
      "media-b": "https://example.com/thumb-b.webp",
    });
  });

  it("dedupes and sorts media ids before resolving thumb urls", async () => {
    const request = new Request("http://localhost/api/media/thumbs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        treeId: "1d8d6f1c-49a0-4e4f-8ed4-2c36a58b0a11",
        mediaIds: [
          "d7f46253-9cc9-4d6d-b0e2-f5c6dd5df553",
          "1dbd44d4-f14e-49d2-b8ad-40ca5654b816",
          "d7f46253-9cc9-4d6d-b0e2-f5c6dd5df553",
        ],
      }),
    });

    await POST(request);

    expect(mocks.resolveTreeMediaThumbUrls).toHaveBeenCalledTimes(1);
    expect(mocks.resolveTreeMediaThumbUrls).toHaveBeenCalledWith({
      treeId: "1d8d6f1c-49a0-4e4f-8ed4-2c36a58b0a11",
      mediaIds: [
        "1dbd44d4-f14e-49d2-b8ad-40ca5654b816",
        "d7f46253-9cc9-4d6d-b0e2-f5c6dd5df553",
      ],
      shareToken: null,
      resolvedUser: { id: "user-1", email: "user-1@example.com" },
    });
  });

  it("serves repeated identical batches from the short in-memory cache", async () => {
    const makeRequest = () =>
      new Request("http://localhost/api/media/thumbs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treeId: "1d8d6f1c-49a0-4e4f-8ed4-2c36a58b0a11",
          mediaIds: [
            "1dbd44d4-f14e-49d2-b8ad-40ca5654b816",
            "d7f46253-9cc9-4d6d-b0e2-f5c6dd5df553",
          ],
        }),
      });

    const firstResponse = await POST(makeRequest());
    const secondResponse = await POST(makeRequest());

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(mocks.resolveTreeMediaThumbUrls).toHaveBeenCalledTimes(1);
  });
});
