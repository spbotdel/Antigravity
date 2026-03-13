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
    setPrimaryPersonMedia.mockResolvedValue({
      id: "relation-1",
      person_id: personId,
      media_id: "media-1",
      is_primary: true
    });

    const response = await PATCH(
      new Request("http://localhost/api/media/media-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personId,
          setPrimary: true
        })
      }),
      {
        params: Promise.resolve({ mediaId: "media-1" })
      }
    );
    const payload = await response.json();

    expect(setPrimaryPersonMedia).toHaveBeenCalledWith("media-1", personId);
    expect(response.status).toBe(200);
    expect(payload.message).toBe("Фото назначено аватаром.");
    expect(payload.relation.is_primary).toBe(true);
  });
});
