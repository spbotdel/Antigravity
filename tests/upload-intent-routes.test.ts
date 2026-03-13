import { beforeEach, describe, expect, it, vi } from "vitest";

const createMediaUploadTarget = vi.fn();
const createArchiveMediaUploadTarget = vi.fn();

vi.mock("@/lib/server/repository", () => ({
  createMediaUploadTarget,
  createArchiveMediaUploadTarget,
}));

describe("media upload-intent routes", () => {
  beforeEach(() => {
    createMediaUploadTarget.mockReset();
    createArchiveMediaUploadTarget.mockReset();
  });

  it("returns the repository upload transport contract from /api/media/upload-intent", async () => {
    const { POST } = await import("@/app/api/media/upload-intent/route");
    createMediaUploadTarget.mockResolvedValue({
      mediaId: crypto.randomUUID(),
      kind: "photo",
      path: "trees/tree-1/media/photo/media-1/original.jpg",
      bucket: "bucket-1",
      signedUrl: "https://example.com/original",
      token: null,
      uploadProvider: "object_storage",
      configuredBackend: "cloudflare_r2",
      resolvedUploadBackend: "cloudflare_r2",
      rolloutState: "cloudflare_rollout_active",
      forceProxyUpload: false,
      uploadMode: "direct",
      variantUploadMode: "server_proxy",
      variantTargets: [
        {
          variant: "thumb",
          path: "trees/tree-1/media/photo/media-1/variants/thumb.webp",
          signedUrl: "https://example.com/thumb",
          token: null,
          uploadProvider: "object_storage",
        },
      ],
    });

    const request = new Request("http://localhost/api/media/upload-intent", {
      method: "POST",
      body: JSON.stringify({
        treeId: crypto.randomUUID(),
        personId: crypto.randomUUID(),
        filename: "family-photo.jpg",
        mimeType: "image/jpeg",
        visibility: "members",
        title: "Фото",
        caption: "",
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.configuredBackend).toBe("cloudflare_r2");
    expect(payload.resolvedUploadBackend).toBe("cloudflare_r2");
    expect(payload.rolloutState).toBe("cloudflare_rollout_active");
    expect(payload.forceProxyUpload).toBe(false);
    expect(payload.uploadMode).toBe("direct");
    expect(payload.variantUploadMode).toBe("server_proxy");
    expect(payload.variantTargets).toHaveLength(1);
  });

  it("returns the repository upload transport contract from /api/media/archive/upload-intent", async () => {
    const { POST } = await import("@/app/api/media/archive/upload-intent/route");
    createArchiveMediaUploadTarget.mockResolvedValue({
      mediaId: crypto.randomUUID(),
      kind: "video",
      path: "trees/tree-1/media/video/media-1/original.webm",
      bucket: "bucket-1",
      signedUrl: "https://example.com/original-video",
      token: null,
      uploadProvider: "object_storage",
      configuredBackend: "cloudflare_r2",
      resolvedUploadBackend: "object_storage",
      rolloutState: "cloudflare_rollout_gated",
      forceProxyUpload: false,
      uploadMode: "direct",
      variantUploadMode: "none",
      variantTargets: [],
    });

    const request = new Request("http://localhost/api/media/archive/upload-intent", {
      method: "POST",
      body: JSON.stringify({
        treeId: crypto.randomUUID(),
        filename: "family-video.webm",
        mimeType: "video/webm",
        visibility: "members",
        title: "Видео",
        caption: "",
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.configuredBackend).toBe("cloudflare_r2");
    expect(payload.resolvedUploadBackend).toBe("object_storage");
    expect(payload.rolloutState).toBe("cloudflare_rollout_gated");
    expect(payload.forceProxyUpload).toBe(false);
    expect(payload.uploadMode).toBe("direct");
    expect(payload.variantUploadMode).toBe("none");
    expect(payload.variantTargets).toEqual([]);
  });
});
