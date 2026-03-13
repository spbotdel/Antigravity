import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MediaPage from "@/app/tree/[slug]/media/page";

const mocks = vi.hoisted(() => ({
  getTreeMediaPageData: vi.fn(),
}));

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
}));

describe("media page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        searchParams: Promise.resolve({ mode: "photo", view: "albums", album: "uploader-user-1" }),
      })
    );

    expect(screen.getByTestId("tree-media-archive-client")).toHaveTextContent("album:uploader-user-1");
  });
});
