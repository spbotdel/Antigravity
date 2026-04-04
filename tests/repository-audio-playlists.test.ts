import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSupabaseAdminRestJson: vi.fn(),
  fetchSupabaseAdminRestBatchJson: vi.fn(),
  fetchSupabaseAdminRestJsonWithHeaders: vi.fn(),
  parsePowerShellJsonStdout: vi.fn(),
  getCurrentUser: vi.fn(),
  requireAuthenticatedUserId: vi.fn(),
  hasRequiredRole: vi.fn(),
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

vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return {
    ...actual,
    hasRequiredRole: mocks.hasRequiredRole,
  };
});

import {
  addAudioMediaToTreeAudioPlaylist,
  createTreeAudioPlaylist,
  deleteTreeAudioPlaylist,
  removeAudioMediaFromTreeAudioPlaylistItem,
} from "@/lib/server/repository";

describe("audio playlists repository", () => {
  const tree = {
    id: "tree-1",
    owner_user_id: "user-owner",
    slug: "demo-family",
    title: "Demo Family",
    description: null,
    visibility: "private",
    root_person_id: null,
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
  } as const;

  const membership = {
    id: "membership-admin",
    tree_id: tree.id,
    user_id: "user-editor",
    role: "admin",
    status: "active",
    created_at: "2026-04-01T00:00:00.000Z",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-editor" });
    mocks.requireAuthenticatedUserId.mockResolvedValue("user-editor");
    mocks.hasRequiredRole.mockImplementation((role: string, allowedRoles: string[]) => allowedRoles.includes(role));
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string, options?: { method?: string; body?: unknown }) => {
      if (pathWithQuery === "audit_log" && options?.method === "POST") {
        return [];
      }

      if (pathWithQuery === `trees?select=*&id=eq.${tree.id}&limit=1`) {
        return [tree];
      }

      if (pathWithQuery === `tree_memberships?select=*&tree_id=eq.${tree.id}&user_id=eq.user-editor&status=eq.active&limit=1`) {
        return [membership];
      }

      return [];
    });
  });

  it("creates a tree-scoped audio playlist", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string, options?: { method?: string; body?: Record<string, unknown> }) => {
      if (pathWithQuery === "audit_log" && options?.method === "POST") {
        return [];
      }

      if (pathWithQuery === `trees?select=*&id=eq.${tree.id}&limit=1`) {
        return [tree];
      }

      if (pathWithQuery === `tree_memberships?select=*&tree_id=eq.${tree.id}&user_id=eq.user-editor&status=eq.active&limit=1`) {
        return [membership];
      }

      if (pathWithQuery === "tree_audio_playlists" && options?.method === "POST") {
        return [
          {
            id: "playlist-1",
            tree_id: tree.id,
            name: options.body?.name,
            created_at: "2026-04-01T01:00:00.000Z",
            updated_at: "2026-04-01T01:00:00.000Z",
          },
        ];
      }

      return [];
    });

    const result = await createTreeAudioPlaylist({
      treeId: tree.id,
      name: "Колыбельные",
    });

    expect(result).toMatchObject({
      id: "playlist-1",
      tree_id: tree.id,
      name: "Колыбельные",
    });
  });

  it("adds audio media to a playlist with the next explicit position", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string, options?: { method?: string; body?: Record<string, unknown> }) => {
      if (pathWithQuery === "audit_log" && options?.method === "POST") {
        return [];
      }

      if (pathWithQuery === `trees?select=*&id=eq.${tree.id}&limit=1`) {
        return [tree];
      }

      if (pathWithQuery === `tree_memberships?select=*&tree_id=eq.${tree.id}&user_id=eq.user-editor&status=eq.active&limit=1`) {
        return [membership];
      }

      if (pathWithQuery === `tree_audio_playlists?select=*&id=eq.playlist-1&tree_id=eq.${tree.id}&limit=1`) {
        return [
          {
            id: "playlist-1",
            tree_id: tree.id,
            name: "Колыбельные",
            created_at: "2026-04-01T01:00:00.000Z",
            updated_at: "2026-04-01T01:00:00.000Z",
          },
        ];
      }

      if (pathWithQuery === `media_assets?select=*&id=eq.audio-1&tree_id=eq.${tree.id}&limit=1`) {
        return [
          {
            id: "audio-1",
            tree_id: tree.id,
            kind: "audio",
            provider: "cloudflare_r2",
            visibility: "members",
            storage_path: "trees/tree-1/media/audio/audio-1/file.mp3",
            external_url: null,
            title: "Track 1",
            caption: null,
            mime_type: "audio/mpeg",
            size_bytes: 1024,
            preview_status: null,
            preview_error: null,
            preview_attempt_count: 0,
            preview_claimed_at: null,
            created_by: "user-editor",
            created_at: "2026-04-01T01:00:00.000Z",
          },
        ];
      }

      if (pathWithQuery === "tree_audio_playlist_items?select=*&playlist_id=eq.playlist-1&media_id=eq.audio-1&limit=1") {
        return [];
      }

      if (pathWithQuery === "tree_audio_playlist_items?select=position&playlist_id=eq.playlist-1&order=position.desc&limit=1") {
        return [{ position: 2 }];
      }

      if (pathWithQuery === "tree_audio_playlist_items" && options?.method === "POST") {
        return [
          {
            id: "playlist-item-3",
            playlist_id: "playlist-1",
            media_id: "audio-1",
            position: options.body?.position,
            created_at: "2026-04-01T01:10:00.000Z",
          },
        ];
      }

      return [];
    });

    const result = await addAudioMediaToTreeAudioPlaylist({
      treeId: tree.id,
      playlistId: "playlist-1",
      mediaId: "audio-1",
    });

    expect(result.item).toMatchObject({
      id: "playlist-item-3",
      playlist_id: "playlist-1",
      media_id: "audio-1",
      position: 3,
    });
  });

  it("rejects non-audio media for playlists", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string) => {
      if (pathWithQuery === `trees?select=*&id=eq.${tree.id}&limit=1`) {
        return [tree];
      }

      if (pathWithQuery === `tree_memberships?select=*&tree_id=eq.${tree.id}&user_id=eq.user-editor&status=eq.active&limit=1`) {
        return [membership];
      }

      if (pathWithQuery === `tree_audio_playlists?select=*&id=eq.playlist-1&tree_id=eq.${tree.id}&limit=1`) {
        return [{ id: "playlist-1", tree_id: tree.id, name: "Колыбельные", created_at: tree.created_at, updated_at: tree.updated_at }];
      }

      if (pathWithQuery === `media_assets?select=*&id=eq.video-1&tree_id=eq.${tree.id}&limit=1`) {
        return [
          {
            id: "video-1",
            tree_id: tree.id,
            kind: "video",
            provider: "cloudflare_r2",
            visibility: "members",
            storage_path: "trees/tree-1/media/video/video-1/file.mp4",
            external_url: null,
            title: "Video",
            caption: null,
            mime_type: "video/mp4",
            size_bytes: 1024,
            preview_status: null,
            preview_error: null,
            preview_attempt_count: 0,
            preview_claimed_at: null,
            created_by: "user-editor",
            created_at: tree.created_at,
          },
        ];
      }

      return [];
    });

    await expect(
      addAudioMediaToTreeAudioPlaylist({
        treeId: tree.id,
        playlistId: "playlist-1",
        mediaId: "video-1",
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "В плейлист можно добавлять только аудио.",
    });
  });

  it("rejects cross-tree media references", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string) => {
      if (pathWithQuery === `trees?select=*&id=eq.${tree.id}&limit=1`) {
        return [tree];
      }

      if (pathWithQuery === `tree_memberships?select=*&tree_id=eq.${tree.id}&user_id=eq.user-editor&status=eq.active&limit=1`) {
        return [membership];
      }

      if (pathWithQuery === `tree_audio_playlists?select=*&id=eq.playlist-1&tree_id=eq.${tree.id}&limit=1`) {
        return [{ id: "playlist-1", tree_id: tree.id, name: "Колыбельные", created_at: tree.created_at, updated_at: tree.updated_at }];
      }

      if (pathWithQuery === `media_assets?select=*&id=eq.audio-cross-tree&tree_id=eq.${tree.id}&limit=1`) {
        return [];
      }

      return [];
    });

    await expect(
      addAudioMediaToTreeAudioPlaylist({
        treeId: tree.id,
        playlistId: "playlist-1",
        mediaId: "audio-cross-tree",
      })
    ).rejects.toMatchObject({
      status: 404,
      message: "Аудиозапись не найдена.",
    });
  });

  it("prevents duplicate audio inside one playlist", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string) => {
      if (pathWithQuery === `trees?select=*&id=eq.${tree.id}&limit=1`) {
        return [tree];
      }

      if (pathWithQuery === `tree_memberships?select=*&tree_id=eq.${tree.id}&user_id=eq.user-editor&status=eq.active&limit=1`) {
        return [membership];
      }

      if (pathWithQuery === `tree_audio_playlists?select=*&id=eq.playlist-1&tree_id=eq.${tree.id}&limit=1`) {
        return [{ id: "playlist-1", tree_id: tree.id, name: "Колыбельные", created_at: tree.created_at, updated_at: tree.updated_at }];
      }

      if (pathWithQuery === `media_assets?select=*&id=eq.audio-1&tree_id=eq.${tree.id}&limit=1`) {
        return [
          {
            id: "audio-1",
            tree_id: tree.id,
            kind: "audio",
            provider: "cloudflare_r2",
            visibility: "members",
            storage_path: "trees/tree-1/media/audio/audio-1/file.mp3",
            external_url: null,
            title: "Track 1",
            caption: null,
            mime_type: "audio/mpeg",
            size_bytes: 1024,
            preview_status: null,
            preview_error: null,
            preview_attempt_count: 0,
            preview_claimed_at: null,
            created_by: "user-editor",
            created_at: tree.created_at,
          },
        ];
      }

      if (pathWithQuery === "tree_audio_playlist_items?select=*&playlist_id=eq.playlist-1&media_id=eq.audio-1&limit=1") {
        return [{ id: "playlist-item-1", playlist_id: "playlist-1", media_id: "audio-1", position: 1, created_at: tree.created_at }];
      }

      return [];
    });

    await expect(
      addAudioMediaToTreeAudioPlaylist({
        treeId: tree.id,
        playlistId: "playlist-1",
        mediaId: "audio-1",
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "Этот трек уже есть в плейлисте.",
    });
  });

  it("removes a playlist item by playlistItemId", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string, options?: { method?: string }) => {
      if (pathWithQuery === `trees?select=*&id=eq.${tree.id}&limit=1`) {
        return [tree];
      }

      if (pathWithQuery === `tree_memberships?select=*&tree_id=eq.${tree.id}&user_id=eq.user-editor&status=eq.active&limit=1`) {
        return [membership];
      }

      if (pathWithQuery === "tree_audio_playlist_items?select=*,playlist:tree_audio_playlists!inner(id,tree_id)&id=eq.playlist-item-1&limit=1") {
        return [
          {
            id: "playlist-item-1",
            playlist_id: "playlist-1",
            media_id: "audio-1",
            position: 1,
            created_at: tree.created_at,
            playlist: { id: "playlist-1", tree_id: tree.id },
          },
        ];
      }

      if (pathWithQuery === "tree_audio_playlist_items?id=eq.playlist-item-1" && options?.method === "DELETE") {
        return [];
      }

      if (pathWithQuery === "audit_log" && options?.method === "POST") {
        return [];
      }

      return [];
    });

    const result = await removeAudioMediaFromTreeAudioPlaylistItem("playlist-item-1");

    expect(result).toMatchObject({
      itemId: "playlist-item-1",
      message: "Трек удален из плейлиста.",
    });
  });

  it("deletes a playlist through the playlist table entry point", async () => {
    mocks.fetchSupabaseAdminRestJson.mockImplementation(async (pathWithQuery: string, options?: { method?: string }) => {
      if (pathWithQuery === `trees?select=*&id=eq.${tree.id}&limit=1`) {
        return [tree];
      }

      if (pathWithQuery === `tree_memberships?select=*&tree_id=eq.${tree.id}&user_id=eq.user-editor&status=eq.active&limit=1`) {
        return [membership];
      }

      if (pathWithQuery === "tree_audio_playlists?select=*&id=eq.playlist-1&limit=1") {
        return [{ id: "playlist-1", tree_id: tree.id, name: "Колыбельные", created_at: tree.created_at, updated_at: tree.updated_at }];
      }

      if (pathWithQuery === "tree_audio_playlists?id=eq.playlist-1" && options?.method === "DELETE") {
        return [];
      }

      if (pathWithQuery === "audit_log" && options?.method === "POST") {
        return [];
      }

      return [];
    });

    await expect(deleteTreeAudioPlaylist("playlist-1")).resolves.toBeUndefined();
  });

  it("declares playlist item cascade delete in the migration", () => {
    const migration = readFileSync("supabase/migrations/20260401123000_tree_audio_playlists_v1.sql", "utf8");

    expect(migration).toContain("playlist_id uuid not null references public.tree_audio_playlists(id) on delete cascade");
  });
});
