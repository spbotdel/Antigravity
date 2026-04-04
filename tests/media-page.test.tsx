import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MediaPage from "@/app/tree/[slug]/media/page";

const mocks = vi.hoisted(() => ({
  after: vi.fn((callback: () => void | Promise<void>) => {
    void callback();
  }),
  getTreeMediaPageData: vi.fn(),
  processCloudflareVideoPreviewJobs: vi.fn(),
  resolveMediaThumbUrlsForVisibleMedia: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: mocks.after,
  };
});

vi.mock("@/components/layout/tree-nav", () => ({
  TreeNav: ({
    shareToken,
    canEdit,
  }: {
    shareToken?: string | null;
    canEdit: boolean;
  }) => <div data-testid="tree-nav">share:{shareToken || "none"};edit:{String(canEdit)}</div>,
}));

vi.mock("@/components/media/tree-media-archive-client", () => ({
  TreeMediaArchiveClient: ({
    shareToken,
    canEdit,
    initialMode,
    initialView,
    initialAlbumId,
    allMedia,
    allAlbums,
  }: {
    shareToken?: string | null;
    canEdit: boolean;
    initialMode: string;
    initialView: string;
    initialAlbumId?: string | null;
    allMedia: Array<{ id: string }>;
    allAlbums: Array<{ id: string }>;
  }) => (
    <div data-testid="tree-media-archive-client">
      share:{shareToken || "none"};edit:{String(canEdit)};mode:{initialMode};view:{initialView};album:{initialAlbumId || "none"};media:{allMedia.length};albums:{allAlbums.length}
    </div>
  ),
}));

vi.mock("@/lib/server/repository", () => ({
  getTreeMediaPageData: mocks.getTreeMediaPageData,
  processCloudflareVideoPreviewJobs: mocks.processCloudflareVideoPreviewJobs,
  resolveMediaThumbUrlsForVisibleMedia: mocks.resolveMediaThumbUrlsForVisibleMedia,
}));

describe("media page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.after.mockImplementation((callback: () => void | Promise<void>) => {
      void callback();
    });
    mocks.resolveMediaThumbUrlsForVisibleMedia.mockResolvedValue({});
    mocks.processCloudflareVideoPreviewJobs.mockResolvedValue({ claimedCount: 0, results: [] });
  });

  it("renders the tree media workspace for editors with summary counts", async () => {
    mocks.getTreeMediaPageData.mockResolvedValue({
      tree: {
        id: "tree-1",
        owner_user_id: "user-1",
        slug: "demo-family",
        title: "Demo Family",
        description: null,
        visibility: "private",
        root_person_id: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
      actor: {
        userId: "user-1",
        role: "owner",
        isAuthenticated: true,
        accessSource: "membership",
        shareLinkId: null,
        canEdit: true,
        canManageMembers: true,
        canManageSettings: true,
        canReadAudit: true,
      },
      media: [
        {
          id: "photo-1",
          tree_id: "tree-1",
          kind: "photo",
          provider: "object_storage",
          visibility: "members",
          storage_path: "trees/tree-1/media/photo/photo-1/file.jpg",
          external_url: null,
          title: "Photo",
          caption: null,
          mime_type: "image/jpeg",
          size_bytes: 1024,
          created_by: "user-1",
          created_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "video-1",
          tree_id: "tree-1",
          kind: "video",
          provider: "object_storage",
          visibility: "members",
          storage_path: "trees/tree-1/media/video/video-1/file.webm",
          external_url: null,
          title: "Video",
          caption: null,
          mime_type: "video/webm",
          size_bytes: 2048,
          created_by: "user-1",
          created_at: "2026-03-09T00:00:00.000Z",
        },
      ],
      albums: [
        {
          id: "album-1",
          tree_id: "tree-1",
          title: "Свадьба",
          description: null,
          kind: "photo",
          access: "members",
          album_kind: "manual",
          uploader_user_id: null,
          created_by: "user-1",
          created_at: "2026-03-09T00:00:00.000Z",
          updated_at: "2026-03-09T00:00:00.000Z",
        },
      ],
      items: [
        {
          id: "album-item-1",
          album_id: "album-1",
          media_id: "photo-1",
          created_at: "2026-03-09T00:00:00.000Z",
        },
      ],
      uploaderLabelsById: new Map([["user-1", "От Вячеслава"]]),
    });

    render(
      await MediaPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ mode: "video", view: "albums" }),
      })
    );

    expect(mocks.getTreeMediaPageData).toHaveBeenCalledWith("demo-family", { shareToken: null });
    expect(screen.getByRole("heading", { name: "Demo Family" })).toBeInTheDocument();
    expect(screen.getByText("1 фото")).toBeInTheDocument();
    expect(screen.getByText("1 видео")).toBeInTheDocument();
    expect(screen.getByText("2 альбомов")).toBeInTheDocument();
    expect(screen.getByTestId("tree-nav")).toHaveTextContent("share:none;edit:true");
    expect(screen.getByTestId("tree-media-archive-client")).toHaveTextContent("share:none;edit:true;mode:video;view:albums;album:none;media:2;albums:1");
  });

  it("keeps the media page readable for share-link viewers and passes the share token through", async () => {
    mocks.getTreeMediaPageData.mockResolvedValue({
      tree: {
        id: "tree-1",
        owner_user_id: "user-1",
        slug: "demo-family",
        title: "Demo Family",
        description: null,
        visibility: "private",
        root_person_id: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
      actor: {
        userId: null,
        role: null,
        isAuthenticated: false,
        accessSource: "share_link",
        shareLinkId: "share-1",
        canEdit: false,
        canManageMembers: false,
        canManageSettings: false,
        canReadAudit: false,
      },
      media: [],
      albums: [],
      items: [],
      uploaderLabelsById: new Map(),
    });

    render(
      await MediaPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ share: "family-token", mode: "photo", view: "all" }),
      })
    );

    expect(mocks.getTreeMediaPageData).toHaveBeenCalledWith("demo-family", { shareToken: "family-token" });
    expect(screen.getByTestId("tree-nav")).toHaveTextContent("share:family-token;edit:false");
    expect(screen.getByTestId("tree-media-archive-client")).toHaveTextContent("share:family-token;edit:false;mode:photo;view:all;album:none;media:0;albums:0");
  });

  it("passes the selected album from the query string into the archive client", async () => {
    mocks.getTreeMediaPageData.mockResolvedValue({
      tree: {
        id: "tree-1",
        owner_user_id: "user-1",
        slug: "demo-family",
        title: "Demo Family",
        description: null,
        visibility: "private",
        root_person_id: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
      actor: {
        userId: "user-1",
        role: "owner",
        isAuthenticated: true,
        accessSource: "membership",
        shareLinkId: null,
        canEdit: true,
        canManageMembers: true,
        canManageSettings: true,
        canReadAudit: true,
      },
      media: [],
      albums: [],
      items: [],
      uploaderLabelsById: new Map(),
    });

    render(
      await MediaPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ mode: "photo", view: "albums", album: "uploader-user-1-photo" }),
      })
    );

    expect(screen.getByTestId("tree-media-archive-client")).toHaveTextContent("album:uploader-user-1-photo");
  });

  it("passes only photo and video media into the all-media archive dataset", async () => {
    mocks.getTreeMediaPageData.mockResolvedValue({
      tree: {
        id: "tree-1",
        owner_user_id: "user-1",
        slug: "demo-family",
        title: "Demo Family",
        description: null,
        visibility: "private",
        root_person_id: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
      actor: {
        userId: "user-1",
        role: "owner",
        isAuthenticated: true,
        accessSource: "membership",
        shareLinkId: null,
        canEdit: true,
        canManageMembers: true,
        canManageSettings: true,
        canReadAudit: true,
      },
      media: [
        {
          id: "photo-1",
          tree_id: "tree-1",
          kind: "photo",
          provider: "object_storage",
          visibility: "members",
          storage_path: "trees/tree-1/media/photo/photo-1/file.jpg",
          external_url: null,
          title: "Photo",
          caption: null,
          mime_type: "image/jpeg",
          size_bytes: 1024,
          created_by: "user-1",
          created_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "video-1",
          tree_id: "tree-1",
          kind: "video",
          provider: "object_storage",
          visibility: "members",
          storage_path: "trees/tree-1/media/video/video-1/file.mp4",
          external_url: null,
          title: "Video",
          caption: null,
          mime_type: "video/mp4",
          size_bytes: 2048,
          created_by: "user-1",
          created_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "audio-1",
          tree_id: "tree-1",
          kind: "audio",
          provider: "cloudflare_r2",
          visibility: "members",
          storage_path: "trees/tree-1/media/audio/audio-1/file.mp3",
          external_url: null,
          title: "Audio",
          caption: null,
          mime_type: "audio/mpeg",
          size_bytes: 4096,
          created_by: "user-1",
          created_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "document-1",
          tree_id: "tree-1",
          kind: "document",
          provider: "cloudflare_r2",
          visibility: "members",
          storage_path: "trees/tree-1/media/document/document-1/file.pdf",
          external_url: null,
          title: "Document",
          caption: null,
          mime_type: "application/pdf",
          size_bytes: 512,
          created_by: "user-1",
          created_at: "2026-03-09T00:00:00.000Z",
        },
      ],
      albums: [],
      items: [],
      uploaderLabelsById: new Map(),
      audioPlaylists: [],
      audioPlaylistItems: [],
      audioPlaylistsAvailable: true,
    });

    render(
      await MediaPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ mode: "all", view: "all" }),
      })
    );

    expect(screen.getByTestId("tree-media-archive-client")).toHaveTextContent("mode:all;view:all;album:none;media:4;albums:0");
  });

  it("re-triggers visible cloudflare video previews that are still pending or processing", async () => {
    mocks.getTreeMediaPageData.mockResolvedValue({
      tree: {
        id: "tree-1",
        owner_user_id: "user-1",
        slug: "demo-family",
        title: "Demo Family",
        description: null,
        visibility: "private",
        root_person_id: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
      actor: {
        userId: "user-1",
        role: "owner",
        isAuthenticated: true,
        accessSource: "membership",
        shareLinkId: null,
        canEdit: true,
        canManageMembers: true,
        canManageSettings: true,
        canReadAudit: true,
      },
      media: [
        {
          id: "video-ready",
          tree_id: "tree-1",
          kind: "video",
          provider: "cloudflare_r2",
          visibility: "members",
          storage_path: "trees/tree-1/media/video/video-ready/file.mp4",
          external_url: null,
          title: "Ready video",
          caption: null,
          mime_type: "video/mp4",
          size_bytes: 2048,
          created_by: "user-1",
          created_at: "2026-03-09T00:00:00.000Z",
          preview_status: "ready",
          preview_error: null,
          preview_attempt_count: 1,
          preview_claimed_at: null,
        },
        {
          id: "video-pending",
          tree_id: "tree-1",
          kind: "video",
          provider: "cloudflare_r2",
          visibility: "members",
          storage_path: "trees/tree-1/media/video/video-pending/file.mp4",
          external_url: null,
          title: "Pending video",
          caption: null,
          mime_type: "video/mp4",
          size_bytes: 4096,
          created_by: "user-1",
          created_at: "2026-03-08T00:00:00.000Z",
          preview_status: "pending",
          preview_error: null,
          preview_attempt_count: 0,
          preview_claimed_at: null,
        },
        {
          id: "video-processing",
          tree_id: "tree-1",
          kind: "video",
          provider: "cloudflare_r2",
          visibility: "members",
          storage_path: "trees/tree-1/media/video/video-processing/file.mp4",
          external_url: null,
          title: "Processing video",
          caption: null,
          mime_type: "video/mp4",
          size_bytes: 8192,
          created_by: "user-1",
          created_at: "2026-03-07T00:00:00.000Z",
          preview_status: "processing",
          preview_error: null,
          preview_attempt_count: 1,
          preview_claimed_at: "2026-03-07T00:10:00.000Z",
        },
      ],
      albums: [],
      items: [],
      uploaderLabelsById: new Map(),
    });

    render(
      await MediaPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ mode: "video", view: "all" }),
      })
    );

    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.processCloudflareVideoPreviewJobs).toHaveBeenCalledWith({
      mediaIds: ["video-pending", "video-processing"],
    });
  });
});
