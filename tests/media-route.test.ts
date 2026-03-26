import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveMediaAccess = vi.fn();
const deleteMedia = vi.fn();
const setPrimaryPersonMedia = vi.fn();

vi.mock("@/lib/server/repository", () => ({
  resolveMediaAccess,
  deleteMedia,
  setPrimaryPersonMedia,
}));

describe("media route", () => {
  beforeEach(() => {
    resolveMediaAccess.mockReset();
    deleteMedia.mockReset();
    setPrimaryPersonMedia.mockReset();
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
});
