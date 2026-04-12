import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSupabaseAdminRestJson: vi.fn(),
  fetchSupabaseAdminRestBatchJson: vi.fn(),
  fetchSupabaseAdminRestJsonWithHeaders: vi.fn(),
  parsePowerShellJsonStdout: vi.fn(),
  getCurrentUser: vi.fn(),
  requireAuthenticatedUserId: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  createAdminSupabaseStorageClient: vi.fn(),
  storageFrom: vi.fn(),
  storageCreateSignedUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/admin-rest", () => ({
  fetchSupabaseAdminRestJson: mocks.fetchSupabaseAdminRestJson,
  fetchSupabaseAdminRestBatchJson: mocks.fetchSupabaseAdminRestBatchJson,
  fetchSupabaseAdminRestJsonWithHeaders: mocks.fetchSupabaseAdminRestJsonWithHeaders,
  parsePowerShellJsonStdout: mocks.parsePowerShellJsonStdout,
}));

vi.mock("@/lib/server/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  requireAuthenticatedUserId: mocks.requireAuthenticatedUserId,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
  createAdminSupabaseStorageClient: mocks.createAdminSupabaseStorageClient,
}));

import { addExistingMediaToTreeMediaAlbum, getTreeMediaPageData, resolveEffectiveMediaAccess, resolveMediaAccess, resolveMediaThumbUrlsForVisibleMedia } from "@/lib/server/repository";

function mediaRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "media-1",
    tree_id: "tree-1",
    kind: "photo",
    provider: "object_storage",
    visibility: "public",
    storage_path: "trees/tree-1/media/photo/media-1/original.jpg",
    external_url: null,
    title: "Media",
    caption: null,
    mime_type: "image/jpeg",
    size_bytes: 1024,
    preview_status: null,
    preview_error: null,
    preview_attempt_count: 0,
    preview_claimed_at: null,
    created_by: null,
    created_at: "2026-03-27T00:00:00.000Z",
    ...overrides,
  };
}

function treeRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "tree-1",
    owner_user_id: "user-1",
    slug: "demo-family",
    title: "Demo Family",
    description: null,
    visibility: "public",
    root_person_id: null,
    created_at: "2026-03-27T00:00:00.000Z",
    updated_at: "2026-03-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("repository effective media access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.storageFrom.mockReturnValue({
      createSignedUrl: mocks.storageCreateSignedUrl,
    });
    mocks.createAdminSupabaseClient.mockReturnValue({
      storage: {
        from: mocks.storageFrom,
      },
    });
    mocks.createAdminSupabaseStorageClient.mockReturnValue({
      storage: {
        from: mocks.storageFrom,
      },
    });
  });

  it("returns members for a public file inside a members album", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "media_assets?select=*&id=eq.media-1&limit=1") {
        return [mediaRow()];
      }

      if (
        pathWithQuery ===
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access,album_kind)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1&tree_media_albums.album_kind=eq.manual"
      ) {
        return [{ media_id: "media-1", tree_media_albums: { tree_id: "tree-1", access: "members" } }];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    await expect(resolveEffectiveMediaAccess("media-1")).resolves.toBe("members");
  });

  it("ignores legacy uploader album links when resolving effective access", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "media_assets?select=*&id=eq.media-1&limit=1") {
        return [mediaRow()];
      }

      if (
        pathWithQuery ===
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access,album_kind)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1&tree_media_albums.album_kind=eq.manual"
      ) {
        return [];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    await expect(resolveEffectiveMediaAccess("media-1")).resolves.toBe("public");
  });

  it("returns members for a file with mixed public and members albums", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "media_assets?select=*&id=eq.media-1&limit=1") {
        return [mediaRow()];
      }

      if (
        pathWithQuery ===
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access,album_kind)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1&tree_media_albums.album_kind=eq.manual"
      ) {
        return [
          { media_id: "media-1", tree_media_albums: { tree_id: "tree-1", access: "public" } },
          { media_id: "media-1", tree_media_albums: { tree_id: "tree-1", access: "members" } },
        ];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    await expect(resolveEffectiveMediaAccess("media-1")).resolves.toBe("members");
  });

  it("denies anonymous public-tree access when effective visibility resolves to members", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "media_assets?select=*&id=eq.media-1&limit=1") {
        return [mediaRow()];
      }

      if (pathWithQuery === "trees?select=*&id=eq.tree-1&limit=1") {
        return [treeRow()];
      }

      if (
        pathWithQuery ===
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access,album_kind)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1&tree_media_albums.album_kind=eq.manual"
      ) {
        return [{ media_id: "media-1", tree_media_albums: { tree_id: "tree-1", access: "members" } }];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    await expect(resolveMediaAccess("media-1")).rejects.toMatchObject({
      status: 403,
      message: "У вас нет доступа к этому медиафайлу.",
    });
  });

  it("allows anonymous public-tree access when effective visibility stays public", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "media_assets?select=*&id=eq.media-1&limit=1") {
        return [mediaRow({ provider: "yandex_disk", storage_path: null, external_url: "https://example.com/video" })];
      }

      if (pathWithQuery === "trees?select=*&id=eq.tree-1&limit=1") {
        return [treeRow()];
      }

      if (
        pathWithQuery ===
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access,album_kind)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1&tree_media_albums.album_kind=eq.manual"
      ) {
        return [{ media_id: "media-1", tree_media_albums: { tree_id: "tree-1", access: "public" } }];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    const result = await resolveMediaAccess("media-1");
    expect(result.kind).toBe("video");
  });

  it("falls back to the original photo path when a supabase thumb variant cannot be signed", async () => {
    mocks.storageCreateSignedUrl.mockImplementation(async (storagePath: string) => {
      if (storagePath === "trees/tree-1/media/photo/media-1/variants/thumb.webp") {
        return { data: null, error: null };
      }

      if (storagePath === "trees/tree-1/media/photo/media-1/original.jpg") {
        return {
          data: { signedUrl: "https://example.com/original.jpg" },
          error: null,
        };
      }

      throw new Error(`Unexpected storage path: ${storagePath}`);
    });

    const result = await resolveMediaThumbUrlsForVisibleMedia([
      mediaRow({
        provider: "supabase_storage",
        storage_path: "trees/tree-1/media/photo/media-1/original.jpg",
        created_at: "2026-03-09T00:00:00.000Z",
      }) as never,
    ]);

    expect(result).toEqual({
      "media-1": "https://example.com/original.jpg",
    });
    expect(mocks.storageFrom).toHaveBeenCalledWith("tree-photos");
    expect(mocks.storageCreateSignedUrl).toHaveBeenNthCalledWith(1, "trees/tree-1/media/photo/media-1/variants/thumb.webp", 60);
    expect(mocks.storageCreateSignedUrl).toHaveBeenNthCalledWith(2, "trees/tree-1/media/photo/media-1/original.jpg", 60);
  });

  it("skips a thumb that still cannot be signed after fallback attempts", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.storageCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "fetch failed" },
    });

    const result = await resolveMediaThumbUrlsForVisibleMedia([
      mediaRow({
        provider: "supabase_storage",
        storage_path: "trees/tree-1/media/photo/media-1/original.jpg",
        created_at: "2026-03-09T00:00:00.000Z",
      }) as never,
    ]);

    expect(result).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("filters archive page media and albums by effective access for anonymous readers", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "trees?select=*&slug=eq.demo-family&limit=1") {
        return [treeRow()];
      }

      if (pathWithQuery === "media_assets?select=*&tree_id=eq.tree-1&order=created_at.desc") {
        return [mediaRow()];
      }

      if (pathWithQuery === "tree_audio_playlists?select=*&tree_id=eq.tree-1&order=created_at.desc") {
        return [];
      }

      if (pathWithQuery === "tree_media_albums?select=*&tree_id=eq.tree-1&order=created_at.desc") {
        return [
          {
            id: "album-1",
            tree_id: "tree-1",
            title: "Закрытый альбом",
            description: null,
            kind: "photo",
            access: "members",
            album_kind: "manual",
            uploader_user_id: null,
            created_by: "user-1",
            created_at: "2026-03-27T00:00:00.000Z",
            updated_at: "2026-03-27T00:00:00.000Z",
          },
        ];
      }

      if (pathWithQuery === "tree_media_album_items?select=*&album_id=in.(album-1)") {
        return [
          {
            id: "item-1",
            album_id: "album-1",
            media_id: "media-1",
            created_at: "2026-03-27T00:00:00.000Z",
          },
        ];
      }

      if (
        pathWithQuery ===
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access,album_kind)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1&tree_media_albums.album_kind=eq.manual"
      ) {
        return [{ media_id: "media-1", tree_media_albums: { tree_id: "tree-1", access: "members" } }];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    const result = await getTreeMediaPageData("demo-family");

    expect(result.media).toHaveLength(0);
    expect(result.albums).toHaveLength(0);
    expect(result.items).toHaveLength(0);
  });

  it("returns selected person context and visible linked media ids for person-scoped archive entry", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "trees?select=*&slug=eq.demo-family&limit=1") {
        return [treeRow()];
      }

      if (pathWithQuery === "media_assets?select=*&tree_id=eq.tree-1&order=created_at.desc") {
        return [
          mediaRow({ id: "media-photo-1", kind: "photo", title: "Фото 1" }),
          mediaRow({
            id: "media-video-1",
            kind: "video",
            title: "Видео 1",
            mime_type: "video/mp4",
            storage_path: "trees/tree-1/media/video/media-video-1/original.mp4",
          }),
        ];
      }

      if (pathWithQuery === "tree_audio_playlists?select=*&tree_id=eq.tree-1&order=created_at.desc") {
        return [];
      }

      if (pathWithQuery === "tree_media_albums?select=*&tree_id=eq.tree-1&order=created_at.desc") {
        return [];
      }

      if (pathWithQuery === "persons?select=id,tree_id,full_name&id=eq.person-1&limit=1") {
        return [{
          id: "person-1",
          tree_id: "tree-1",
          full_name: "Борис Соколов",
        }];
      }

      if (pathWithQuery === "persons?select=id,full_name&tree_id=eq.tree-1&id=in.(person-1)") {
        return [{
          id: "person-1",
          full_name: "Борис Соколов",
        }];
      }

      if (pathWithQuery === "person_media?select=person_id,media_id,is_primary&media_id=in.(media-photo-1,media-video-1)") {
        return [
          { person_id: "person-1", media_id: "media-photo-1", is_primary: true },
          { person_id: "person-1", media_id: "media-video-1", is_primary: false },
        ];
      }

      if (
        pathWithQuery ===
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access,album_kind)&media_id=in.(media-photo-1,media-video-1)&tree_media_albums.tree_id=eq.tree-1&tree_media_albums.album_kind=eq.manual"
      ) {
        return [];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    const result = await getTreeMediaPageData("demo-family", { personId: "person-1" });

    expect(result.selectedPerson).toEqual({
      id: "person-1",
      fullName: "Борис Соколов",
    });
    expect(result.selectedPersonMediaIds).toEqual(["media-photo-1", "media-video-1"]);
  });

  it("rejects adding a video file into a photo album", async () => {
    mocks.requireAuthenticatedUserId.mockResolvedValue("user-1");
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "trees?select=*&id=eq.tree-1&limit=1") {
        return [treeRow()];
      }

      if (pathWithQuery === "tree_memberships?select=*&tree_id=eq.tree-1&user_id=eq.user-1&status=eq.active&limit=1") {
        return [];
      }

      if (pathWithQuery === "tree_media_albums?select=*&id=eq.album-1&tree_id=eq.tree-1&limit=1") {
        return [{
          id: "album-1",
          tree_id: "tree-1",
          title: "Фотоархив",
          description: null,
          kind: "photo",
          access: "members",
          album_kind: "manual",
          uploader_user_id: null,
          created_by: "user-1",
          created_at: "2026-03-27T00:00:00.000Z",
          updated_at: "2026-03-27T00:00:00.000Z",
        }];
      }

      if (pathWithQuery === "tree_media_albums?select=*&tree_id=eq.tree-1&id=in.(album-1)") {
        return [{
          id: "album-1",
          tree_id: "tree-1",
          title: "Фотоархив",
          description: null,
          kind: "photo",
          access: "members",
          album_kind: "manual",
          uploader_user_id: null,
          created_by: "user-1",
          created_at: "2026-03-27T00:00:00.000Z",
          updated_at: "2026-03-27T00:00:00.000Z",
        }];
      }

      if (pathWithQuery === "media_assets?select=*&tree_id=eq.tree-1&id=eq.media-1&limit=1") {
        return [mediaRow({
          kind: "video",
          mime_type: "video/mp4",
          storage_path: "trees/tree-1/media/video/media-1/original.mp4",
        })];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    await expect(
      addExistingMediaToTreeMediaAlbum({
        treeId: "tree-1",
        albumId: "album-1",
        mediaIds: ["media-1"],
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "В фотоальбом нельзя добавить видео.",
    });
  });

  it("skips existing album-media links instead of inserting the same pair twice", async () => {
    mocks.requireAuthenticatedUserId.mockResolvedValue("user-1");
    const mutateRequests: string[] = [];

    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery, options) => {
      if (pathWithQuery === "trees?select=*&id=eq.tree-1&limit=1") {
        return [treeRow()];
      }

      if (pathWithQuery === "tree_memberships?select=*&tree_id=eq.tree-1&user_id=eq.user-1&status=eq.active&limit=1") {
        return [];
      }

      if (pathWithQuery === "tree_media_albums?select=*&id=eq.album-1&tree_id=eq.tree-1&limit=1") {
        return [{
          id: "album-1",
          tree_id: "tree-1",
          title: "Фотоархив",
          description: null,
          kind: "photo",
          access: "members",
          album_kind: "manual",
          uploader_user_id: null,
          created_by: "user-1",
          created_at: "2026-03-27T00:00:00.000Z",
          updated_at: "2026-03-27T00:00:00.000Z",
        }];
      }

      if (pathWithQuery === "tree_media_albums?select=*&tree_id=eq.tree-1&id=in.(album-1)") {
        return [{
          id: "album-1",
          tree_id: "tree-1",
          title: "Фотоархив",
          description: null,
          kind: "photo",
          access: "members",
          album_kind: "manual",
          uploader_user_id: null,
          created_by: "user-1",
          created_at: "2026-03-27T00:00:00.000Z",
          updated_at: "2026-03-27T00:00:00.000Z",
        }];
      }

      if (pathWithQuery === "media_assets?select=*&tree_id=eq.tree-1&id=eq.media-1&limit=1") {
        return [mediaRow()];
      }

      if (pathWithQuery === "tree_media_album_items?select=*&media_id=eq.media-1&album_id=in.(album-1)") {
        return [{
          id: "item-existing",
          album_id: "album-1",
          media_id: "media-1",
          created_at: "2026-03-27T00:00:00.000Z",
        }];
      }

      if (pathWithQuery === "tree_media_album_items" && options?.method === "POST") {
        mutateRequests.push(pathWithQuery);
        return [];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    const result = await addExistingMediaToTreeMediaAlbum({
      treeId: "tree-1",
      albumId: "album-1",
      mediaIds: ["media-1"],
    });

    expect(result.createdCount).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(mutateRequests).toHaveLength(0);
  });
});
