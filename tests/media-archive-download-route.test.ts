import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listExistingArchiveMediaForEditor: vi.fn(),
  resolveMediaAccess: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetchMock);

vi.mock("@/lib/server/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/server/repository", () => ({
  listExistingArchiveMediaForEditor: mocks.listExistingArchiveMediaForEditor,
  resolveMediaAccess: mocks.resolveMediaAccess,
}));

vi.mock("@/lib/server/errors", () => ({
  toErrorResponse: (error: unknown) =>
    Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    ),
}));

describe("media archive download route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getCurrentUser.mockReset();
    mocks.listExistingArchiveMediaForEditor.mockReset();
    mocks.resolveMediaAccess.mockReset();
    mocks.fetchMock.mockReset();
  });

  it("streams a zip response and passes resolvedUser into media access checks", async () => {
    const { POST } = await import("@/app/api/media/archive/download/route");
    const resolvedUser = { id: "user-1", email: "user-1@example.com" };
    const upstreamArrayBufferSpy = vi.fn(async () => new ArrayBuffer(0));
    const upstreamResponse = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("archive payload"));
          controller.close();
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/octet-stream"
        }
      }
    );

    Object.defineProperty(upstreamResponse, "arrayBuffer", {
      configurable: true,
      value: upstreamArrayBufferSpy
    });

    mocks.getCurrentUser.mockResolvedValue(resolvedUser);
    mocks.listExistingArchiveMediaForEditor.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Family Photo.jpg",
        storage_path: "trees/tree-1/media/photo/family-photo.jpg",
      }
    ]);
    mocks.resolveMediaAccess.mockResolvedValue({
      kind: "photo",
      url: "https://example.com/archive-file"
    });
    mocks.fetchMock.mockResolvedValue(upstreamResponse);

    const response = await POST(
      new Request("http://localhost/api/media/archive/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          treeId: "22222222-2222-4222-8222-222222222222",
          mediaIds: ["11111111-1111-4111-8111-111111111111"]
        })
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="archive-media-\d{4}-\d{2}-\d{2}\.zip"$/);
    expect(mocks.resolveMediaAccess).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      null,
      null,
      {
        download: false,
        resolvedUser
      }
    );
    expect(upstreamArrayBufferSpy).not.toHaveBeenCalled();

    const zipBytes = new Uint8Array(await response.arrayBuffer());
    const archive = unzipSync(zipBytes);
    expect(new TextDecoder().decode(archive["Family Photo.jpg"])).toBe("archive payload");
  });
});
