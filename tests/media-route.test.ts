import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveMediaAccess = vi.fn();
const getMediaSummary = vi.fn();
const deleteMedia = vi.fn();
const setPrimaryPersonMedia = vi.fn();
const updateTreeMediaAlbum = vi.fn();
const deleteTreeMediaAlbum = vi.fn();

vi.mock("@/lib/server/repository", () => ({
  resolveMediaAccess,
  getMediaSummary,
  deleteMedia,
  setPrimaryPersonMedia,
  updateTreeMediaAlbum,
  deleteTreeMediaAlbum,
}));

describe("media route", () => {
  beforeEach(() => {
    resolveMediaAccess.mockReset();
    getMediaSummary.mockReset();
    deleteMedia.mockReset();
    setPrimaryPersonMedia.mockReset();
    updateTreeMediaAlbum.mockReset();
    deleteTreeMediaAlbum.mockReset();
  });

  it("passes download mode to GET /api/media/[mediaId] when requested", async () => {
    const { GET } = await import("@/app/api/media/[mediaId]/route");
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

  it("passes thumb variants to GET /api/media/[mediaId] when requested", async () => {
    const { GET, __clearMediaThumbResolutionCacheForTests } = await import("@/app/api/media/[mediaId]/route");
    __clearMediaThumbResolutionCacheForTests();
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
