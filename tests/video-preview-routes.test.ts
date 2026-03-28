import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn((callback: () => void | Promise<void>) => {
    void callback();
  }),
  completeMediaUpload: vi.fn(),
  completeArchiveMediaUpload: vi.fn(),
  processCloudflareVideoPreviewJobs: vi.fn(),
  parsePowerShellJsonStdout: vi.fn()
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: mocks.after
  };
});

vi.mock("@/lib/server/repository", () => ({
  completeMediaUpload: mocks.completeMediaUpload,
  completeArchiveMediaUpload: mocks.completeArchiveMediaUpload,
  processCloudflareVideoPreviewJobs: mocks.processCloudflareVideoPreviewJobs
}));

vi.mock("@/lib/supabase/admin-rest", () => ({
  parsePowerShellJsonStdout: mocks.parsePowerShellJsonStdout
}));

function createCloudflareVideoMedia() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tree_id: "22222222-2222-4222-8222-222222222222",
    kind: "video" as const,
    provider: "cloudflare_r2" as const,
    visibility: "members" as const,
    storage_path: "trees/tree-1/media/video/11111111-1111-4111-8111-111111111111/original.mp4",
    external_url: null,
    title: "Video",
    caption: null,
    mime_type: "video/mp4",
    size_bytes: 1024,
    preview_status: "pending" as const,
    preview_error: null,
    preview_attempt_count: 0,
    preview_claimed_at: null,
    created_by: "user-1",
    created_at: "2026-03-28T00:00:00.000Z"
  };
}

describe("video preview routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.after.mockImplementation((callback: () => void | Promise<void>) => {
      void callback();
    });
    mocks.processCloudflareVideoPreviewJobs.mockResolvedValue({ claimedCount: 1, results: [] });
    delete process.env.INTERNAL_MEDIA_PREVIEW_TOKEN;
  });

  it("schedules cloudflare video preview processing after /api/media/complete", async () => {
    const { POST } = await import("@/app/api/media/complete/route");
    mocks.parsePowerShellJsonStdout.mockReturnValue({
      treeId: "22222222-2222-4222-8222-222222222222",
      personId: "33333333-3333-4333-8333-333333333333",
      mediaId: "11111111-1111-4111-8111-111111111111",
      storagePath: "trees/tree-1/media/video/11111111-1111-4111-8111-111111111111/original.mp4",
      visibility: "members",
      title: "Video",
      caption: "",
      mimeType: "video/mp4",
      sizeBytes: 1024
    });
    mocks.completeMediaUpload.mockResolvedValue(createCloudflareVideoMedia());

    const response = await POST(
      new Request("http://localhost/api/media/complete", {
        method: "POST",
        body: "{}"
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.processCloudflareVideoPreviewJobs).toHaveBeenCalledWith({
      mediaIds: ["11111111-1111-4111-8111-111111111111"],
      limit: 1
    });
  });

  it("does not schedule preview processing for non-video uploads", async () => {
    const { POST } = await import("@/app/api/media/complete/route");
    mocks.parsePowerShellJsonStdout.mockReturnValue({
      treeId: "22222222-2222-4222-8222-222222222222",
      personId: "33333333-3333-4333-8333-333333333333",
      mediaId: "44444444-4444-4444-8444-444444444444",
      storagePath: "trees/tree-1/media/photo/44444444-4444-4444-8444-444444444444/original.jpg",
      visibility: "members",
      title: "Photo",
      caption: "",
      mimeType: "image/jpeg",
      sizeBytes: 1024
    });
    mocks.completeMediaUpload.mockResolvedValue({
      ...createCloudflareVideoMedia(),
      id: "44444444-4444-4444-8444-444444444444",
      kind: "photo",
      mime_type: "image/jpeg",
      storage_path: "trees/tree-1/media/photo/44444444-4444-4444-8444-444444444444/original.jpg",
      preview_status: null
    });

    const response = await POST(
      new Request("http://localhost/api/media/complete", {
        method: "POST",
        body: "{}"
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.processCloudflareVideoPreviewJobs).not.toHaveBeenCalled();
  });

  it("schedules cloudflare video preview processing after /api/media/archive/complete", async () => {
    const { POST } = await import("@/app/api/media/archive/complete/route");
    mocks.parsePowerShellJsonStdout.mockReturnValue({
      treeId: "22222222-2222-4222-8222-222222222222",
      mediaId: "11111111-1111-4111-8111-111111111111",
      storagePath: "trees/tree-1/media/video/11111111-1111-4111-8111-111111111111/original.mp4",
      visibility: "members",
      title: "Video",
      caption: "",
      mimeType: "video/mp4",
      sizeBytes: 1024
    });
    mocks.completeArchiveMediaUpload.mockResolvedValue({
      media: createCloudflareVideoMedia(),
      uploaderAlbumId: "album-1"
    });

    const response = await POST(
      new Request("http://localhost/api/media/archive/complete", {
        method: "POST",
        body: "{}"
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.processCloudflareVideoPreviewJobs).toHaveBeenCalledWith({
      mediaIds: ["11111111-1111-4111-8111-111111111111"],
      limit: 1
    });
  });

  it("runs the internal processor route when the bearer token matches", async () => {
    process.env.INTERNAL_MEDIA_PREVIEW_TOKEN = "secret-token";
    mocks.processCloudflareVideoPreviewJobs.mockResolvedValue({
      claimedCount: 1,
      results: [{ mediaId: "media-video-1", status: "ready" }]
    });

    const { POST } = await import("@/app/api/internal/media/process-video-previews/route");
    const response = await POST(
      new Request("http://localhost/api/internal/media/process-video-previews", {
        method: "POST",
        headers: {
          authorization: "Bearer secret-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          limit: 1,
          mediaIds: ["11111111-1111-4111-8111-111111111111"],
          forceRetry: true
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.processCloudflareVideoPreviewJobs).toHaveBeenCalledWith({
      limit: 1,
      mediaIds: ["11111111-1111-4111-8111-111111111111"],
      forceRetry: true
    });
    expect(payload.claimedCount).toBe(1);
  });

  it("rejects the internal processor route when the bearer token is missing", async () => {
    process.env.INTERNAL_MEDIA_PREVIEW_TOKEN = "secret-token";

    const { POST } = await import("@/app/api/internal/media/process-video-previews/route");
    const response = await POST(
      new Request("http://localhost/api/internal/media/process-video-previews", {
        method: "POST"
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Недостаточно прав для запуска processor route.");
    expect(mocks.processCloudflareVideoPreviewJobs).not.toHaveBeenCalled();
  });
});
