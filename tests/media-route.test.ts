import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveMediaAccess = vi.fn();
const getMediaSummary = vi.fn();
const deleteMedia = vi.fn();
const setPrimaryPersonMedia = vi.fn();
const updateTreeMediaAlbum = vi.fn();
const deleteTreeMediaAlbum = vi.fn();
const buildAttachmentContentDisposition = vi.fn((filename: string) => `attachment; filename="${filename}"`);
const buildMediaDownloadFilename = vi.fn((media: { title?: string | null; id: string }) => media.title || `media-${media.id}`);
const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/server/repository", () => ({
  buildAttachmentContentDisposition,
  buildMediaDownloadFilename,
  resolveMediaAccess,
  getMediaSummary,
  deleteMedia,
  setPrimaryPersonMedia,
  updateTreeMediaAlbum,
  deleteTreeMediaAlbum,
}));

describe("media route", () => {
  beforeEach(() => {
    vi.resetModules();
    buildAttachmentContentDisposition.mockClear();
    buildMediaDownloadFilename.mockClear();
    resolveMediaAccess.mockReset();
    getMediaSummary.mockReset();
    deleteMedia.mockReset();
    setPrimaryPersonMedia.mockReset();
    updateTreeMediaAlbum.mockReset();
    deleteTreeMediaAlbum.mockReset();
    fetchMock.mockReset();
  });

  it("passes download mode to GET /api/media/[mediaId] when requested", { timeout: 15000 }, async () => {
    const { GET } = await import("@/app/api/media/[mediaId]/route");
    getMediaSummary.mockResolvedValue({
      id: "media-1",
      kind: "photo",
      mime_type: "image/jpeg",
      title: "media-1.jpg",
    });
    resolveMediaAccess.mockResolvedValue({ url: "https://example.com/download-file", kind: "photo" });

    const response = await GET(
      new Request("http://localhost/api/media/media-1?download=1"),
      {
        params: Promise.resolve({ mediaId: "media-1" })
      }
    );

    expect(resolveMediaAccess).toHaveBeenCalledWith("media-1", null, null, { download: true });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/download-file");
  });

  it("proxies pdf downloads as same-origin attachments", async () => {
    const { GET } = await import("@/app/api/media/[mediaId]/route");
    getMediaSummary.mockResolvedValue({
      id: "media-pdf",
      tree_id: "tree-1",
      kind: "document",
      provider: "cloudflare_r2",
      visibility: "members",
      storage_path: "trees/tree-1/media/document/media-pdf/file.pdf",
      external_url: null,
      title: "resume.pdf",
      caption: null,
      mime_type: "application/pdf",
      size_bytes: 597,
    });
    resolveMediaAccess.mockResolvedValue({ url: "https://example.com/download-file.pdf", kind: "document" });
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-length": "3",
          "content-type": "application/pdf",
        },
      })
    );

    const response = await GET(
      new Request("http://localhost/api/media/media-pdf?download=1"),
      {
        params: Promise.resolve({ mediaId: "media-pdf" })
      }
    );

    expect(getMediaSummary).toHaveBeenCalledWith("media-pdf", null);
    expect(resolveMediaAccess).toHaveBeenCalledWith("media-pdf", null, null, { download: true });
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/download-file.pdf");
    expect(buildMediaDownloadFilename).toHaveBeenCalled();
    expect(buildAttachmentContentDisposition).toHaveBeenCalledWith("resume.pdf");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="resume.pdf"');
  });

  it("returns 413 when a proxied pdf exceeds the hard size limit", async () => {
    const { GET } = await import("@/app/api/media/[mediaId]/route");
    getMediaSummary.mockResolvedValue({
      id: "media-pdf-large",
      tree_id: "tree-1",
      kind: "document",
      provider: "cloudflare_r2",
      visibility: "members",
      storage_path: "trees/tree-1/media/document/media-pdf-large/file.pdf",
      external_url: null,
      title: "huge.pdf",
      caption: null,
      mime_type: "application/pdf",
      size_bytes: 100,
    });
    resolveMediaAccess.mockResolvedValue({ url: "https://example.com/huge.pdf", kind: "document" });
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-length": String(100 * 1024 * 1024 + 1),
          "content-type": "application/pdf",
        },
      })
    );

    const response = await GET(
      new Request("http://localhost/api/media/media-pdf-large?download=1"),
      {
        params: Promise.resolve({ mediaId: "media-pdf-large" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error).toBe("PDF слишком большой для скачивания через сервер.");
    expect(buildAttachmentContentDisposition).not.toHaveBeenCalled();
  });

  it("passes thumb variants to GET /api/media/[mediaId] when requested", async () => {
    const { GET } = await import("@/app/api/media/[mediaId]/route");
    resolveMediaAccess.mockResolvedValue({
      url: "https://example.com/video-thumb.webp",
      kind: "video",
      cacheContext: {
        treeId: "tree-1",
        effectiveVisibility: "members",
        accessSource: "membership"
      }
    });

    const response = await GET(
      new Request("http://localhost/api/media/media-1?variant=thumb"),
      {
        params: Promise.resolve({ mediaId: "media-1" })
      }
    );

    expect(resolveMediaAccess).toHaveBeenCalledWith("media-1", null, "thumb", { download: false, resolvedUser: null });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/video-thumb.webp");
  });

  it("returns a direct client playback url payload when explicitly requested", async () => {
    const { GET } = await import("@/app/api/media/[mediaId]/route");
    resolveMediaAccess.mockResolvedValue({
      url: "https://example.com/direct-video",
      kind: "video",
    });

    const response = await GET(
      new Request("http://localhost/api/media/media-1?playback=client-url"),
      {
        params: Promise.resolve({ mediaId: "media-1" })
      }
    );
    const payload = await response.json();

    expect(resolveMediaAccess).toHaveBeenCalledWith("media-1", null, null, { download: false });
    expect(response.status).toBe(200);
    expect(payload.url).toBe("https://example.com/direct-video");
    expect(payload.kind).toBe("video");
  });

  it("proxies original video GET requests through the app route instead of redirecting", async () => {
    const { GET } = await import("@/app/api/media/[mediaId]/route");
    getMediaSummary.mockResolvedValue({
      id: "media-video",
      tree_id: "tree-1",
      kind: "video",
      provider: "cloudflare_r2",
      visibility: "public",
      storage_path: "trees/tree-1/media/video/media-video/original.mp4",
      external_url: null,
      title: "family-video.mp4",
      caption: null,
      mime_type: "video/mp4",
      size_bytes: 73081327,
      preview_status: "ready",
    });
    resolveMediaAccess.mockResolvedValue({
      url: "https://example.com/signed-video",
      kind: "video",
    });
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-length": "2",
          "content-range": "bytes 0-1/73081327",
          "accept-ranges": "bytes",
          etag: '"etag-video"',
          "last-modified": "Mon, 13 Apr 2026 15:36:03 GMT",
        },
      })
    );

    const response = await GET(
      new Request("http://localhost/api/media/media-video", {
        headers: {
          Range: "bytes=0-1",
        },
      }),
      {
        params: Promise.resolve({ mediaId: "media-video" })
      }
    );

    expect(getMediaSummary).toHaveBeenCalledWith("media-video", null);
    expect(resolveMediaAccess).toHaveBeenCalledWith("media-video", null, null, { download: false });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/signed-video",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.any(Headers),
      })
    );

    const upstreamRequest = fetchMock.mock.calls[0]?.[1];
    expect(upstreamRequest?.headers.get("Range")).toBe("bytes=0-1");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-range")).toBe("bytes 0-1/73081327");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("x-antigravity-media-delivery")).toBe("video-original-proxy");
    expect(response.headers.get("location")).toBeNull();
  }, 15000);

  it("answers HEAD for original video through the app route without redirecting", async () => {
    const { HEAD } = await import("@/app/api/media/[mediaId]/route");
    getMediaSummary.mockResolvedValue({
      id: "media-video",
      tree_id: "tree-1",
      kind: "video",
      provider: "cloudflare_r2",
      visibility: "public",
      storage_path: "trees/tree-1/media/video/media-video/original.mp4",
      external_url: null,
      title: "family-video.mp4",
      caption: null,
      mime_type: "video/mp4",
      size_bytes: 73081327,
      preview_status: "ready",
    });
    resolveMediaAccess.mockResolvedValue({
      url: "https://example.com/signed-video",
      kind: "video",
    });
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-length": "1",
          "content-range": "bytes 0-0/73081327",
          "accept-ranges": "bytes",
        },
      })
    );

    const response = await HEAD(
      new Request("http://localhost/api/media/media-video", {
        method: "HEAD",
      }),
      {
        params: Promise.resolve({ mediaId: "media-video" })
      }
    );

    expect(getMediaSummary).toHaveBeenCalledWith("media-video", null);
    expect(resolveMediaAccess).toHaveBeenCalledWith("media-video", null, null, { download: false });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/signed-video",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      })
    );

    const upstreamRequest = fetchMock.mock.calls[0]?.[1];
    expect(upstreamRequest?.headers.get("Range")).toBe("bytes=0-0");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe("73081327");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("location")).toBeNull();
  });

  it("returns media summary JSON when summary mode is requested", async () => {
    const { GET } = await import("@/app/api/media/[mediaId]/route");
    getMediaSummary.mockResolvedValue({
      id: "media-1",
      preview_status: "ready"
    });

    const response = await GET(
      new Request("http://localhost/api/media/media-1?summary=1"),
      {
        params: Promise.resolve({ mediaId: "media-1" })
      }
    );
    const payload = await response.json();

    expect(getMediaSummary).toHaveBeenCalledWith("media-1", null);
    expect(response.status).toBe(200);
    expect(payload.media.preview_status).toBe("ready");
  });

  it("sets a photo as primary person media via PATCH /api/media/[mediaId]", async () => {
    const { PATCH } = await import("@/app/api/media/[mediaId]/route");
    const personId = crypto.randomUUID();
    const avatarCrop = { x: 0.5, y: 0.5, zoom: 1.6 };
    setPrimaryPersonMedia.mockResolvedValue({
      id: "relation-1",
      person_id: personId,
      media_id: "media-1",
      is_primary: true,
      avatar_crop_x: avatarCrop.x,
      avatar_crop_y: avatarCrop.y,
      avatar_crop_zoom: avatarCrop.zoom
    });

    const response = await PATCH(
      new Request("http://localhost/api/media/media-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personId,
          setPrimary: true,
          avatarCrop
        })
      }),
      {
        params: Promise.resolve({ mediaId: "media-1" })
      }
    );
    const payload = await response.json();

    expect(setPrimaryPersonMedia).toHaveBeenCalledWith("media-1", personId, avatarCrop);
    expect(response.status).toBe(200);
    expect(payload.message).toBe("Аватар обновлен.");
    expect(payload.relation.is_primary).toBe(true);
    expect(payload.relation.avatar_crop_zoom).toBe(avatarCrop.zoom);
  });

  it("updates a tree media album via PATCH /api/media/albums/[albumId]", async () => {
    const { PATCH } = await import("@/app/api/media/albums/[albumId]/route");
    updateTreeMediaAlbum.mockResolvedValue({
      id: "album-1",
      tree_id: "tree-1",
      title: "Семейная поездка",
      description: "Летний архив",
      kind: "photo",
      access: "members",
      album_kind: "manual",
      uploader_user_id: null,
      created_by: "user-1",
      created_at: "2026-03-27T00:00:00.000Z",
      updated_at: "2026-03-27T00:00:00.000Z",
    });

    const response = await PATCH(
      new Request("http://localhost/api/media/albums/album-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Семейная поездка",
          description: "Летний архив",
          access: "members",
        })
      }),
      {
        params: Promise.resolve({ albumId: "album-1" })
      }
    );
    const payload = await response.json();

    expect(updateTreeMediaAlbum).toHaveBeenCalledWith("album-1", {
      title: "Семейная поездка",
      description: "Летний архив",
      access: "members",
    });
    expect(response.status).toBe(200);
    expect(payload.message).toBe("Альбом обновлен.");
    expect(payload.album.title).toBe("Семейная поездка");
  });

  it("deletes a tree media album via DELETE /api/media/albums/[albumId]", async () => {
    const { DELETE } = await import("@/app/api/media/albums/[albumId]/route");

    const response = await DELETE(
      new Request("http://localhost/api/media/albums/album-1", { method: "DELETE" }),
      {
        params: Promise.resolve({ albumId: "album-1" })
      }
    );
    const payload = await response.json();

    expect(deleteTreeMediaAlbum).toHaveBeenCalledWith("album-1");
    expect(response.status).toBe(200);
    expect(payload.message).toBe("Альбом удален.");
  });
});
