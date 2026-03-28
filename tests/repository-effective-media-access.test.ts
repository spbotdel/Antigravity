import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSupabaseAdminRestJson: vi.fn(),
  fetchSupabaseAdminRestBatchJson: vi.fn(),
  fetchSupabaseAdminRestJsonWithHeaders: vi.fn(),
  parsePowerShellJsonStdout: vi.fn(),
  getCurrentUser: vi.fn(),
  requireAuthenticatedUserId: vi.fn(),
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

import { addExistingMediaToTreeMediaAlbum, getTreeMediaPageData, resolveEffectiveMediaAccess, resolveMediaAccess } from "@/lib/server/repository";

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
  });

  it("returns members for a public file inside a members album", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "media_assets?select=*&id=eq.media-1&limit=1") {
        return [mediaRow()];
      }

      if (
        pathWithQuery ===
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1"
      ) {
        return [{ media_id: "media-1", tree_media_albums: { tree_id: "tree-1", access: "members" } }];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    await expect(resolveEffectiveMediaAccess("media-1")).resolves.toBe("members");
  });

  it("returns members for a file with mixed public and members albums", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "media_assets?select=*&id=eq.media-1&limit=1") {
        return [mediaRow()];
      }

      if (
        pathWithQuery ===
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1"
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
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1"
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
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1"
      ) {
        return [{ media_id: "media-1", tree_media_albums: { tree_id: "tree-1", access: "public" } }];
      }

      throw new Error(`Unexpected request: ${pathWithQuery}`);
    });

    const result = await resolveMediaAccess("media-1");
    expect(result.kind).toBe("video");
  });

  it("filters archive page media and albums by effective access for anonymous readers", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery) => {
      if (pathWithQuery === "trees?select=*&slug=eq.demo-family&limit=1") {
        return [treeRow()];
      }

      if (pathWithQuery === "media_assets?select=*&tree_id=eq.tree-1&order=created_at.desc") {
        return [mediaRow()];
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
        "tree_media_album_items?select=media_id,tree_media_albums!inner(tree_id,access)&media_id=in.(media-1)&tree_media_albums.tree_id=eq.tree-1"
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
