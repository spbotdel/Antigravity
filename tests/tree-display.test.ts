import { describe, expect, it } from "vitest";

import { buildBuilderDisplayTree, buildDerivedUploaderAlbumSummaries, buildDisplayTree, buildMediaOpenRouteUrl, buildPersonPhotoPreviewUrls, buildPersistedTreeMediaAlbumMediaMap, buildPhotoPreviewRouteUrl, buildTreeMediaAlbumSummaries, collectPersonMedia, collectTreeMedia, collectUnlinkedTreeMedia } from "@/lib/tree/display";
import type { TreeSnapshot } from "@/lib/types";

const snapshot: TreeSnapshot = {
  tree: {
    id: "tree-1",
    owner_user_id: "user-1",
    slug: "demo-family",
    title: "Demo Family",
    description: null,
    visibility: "public",
    root_person_id: "person-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  actor: {
    userId: null,
    role: null,
    isAuthenticated: false,
    accessSource: "public",
    shareLinkId: null,
    canEdit: false,
    canManageMembers: false,
    canManageSettings: false,
    canReadAudit: false
  },
  people: [
    {
      id: "person-1",
      tree_id: "tree-1",
      full_name: "Root Person",
      gender: "male",
      birth_date: "1950-01-01",
      death_date: null,
      birth_place: null,
      death_place: null,
      bio: null,
      is_living: false,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "person-2",
      tree_id: "tree-1",
      full_name: "Child Person",
      gender: "female",
      birth_date: "1980-04-12",
      death_date: null,
      birth_place: null,
      death_place: null,
      bio: null,
      is_living: true,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  parentLinks: [
    {
      id: "link-1",
      tree_id: "tree-1",
      parent_person_id: "person-1",
      child_person_id: "person-2",
      relation_type: "biological",
      created_at: new Date().toISOString()
    }
  ],
  partnerships: [],
  media: [
    {
      id: "media-1",
      tree_id: "tree-1",
      kind: "photo",
      provider: "supabase_storage",
      visibility: "public",
      storage_path: "trees/tree-1/photos/media-1/root.jpg",
      external_url: null,
      title: "Portrait",
      caption: null,
      mime_type: "image/jpeg",
      size_bytes: 1024,
      created_by: null,
      created_at: new Date().toISOString()
    }
  ],
  personMedia: [
    {
      id: "pm-1",
      person_id: "person-1",
      media_id: "media-1",
      is_primary: true
    }
  ]
};

describe("tree display helpers", () => {
  it("builds a descendant tree from the snapshot", () => {
    const tree = buildDisplayTree(snapshot);

    expect(tree).not.toBeNull();
    expect(tree?.type).toBe("person");
    expect(tree?.children?.[0]?.id).toBe("person-2");
  });

  it("groups shared children under a couple card and keeps solo children on the person", () => {
    const tree = buildDisplayTree({
      ...snapshot,
      people: [
        ...snapshot.people,
        {
          id: "person-3",
          tree_id: "tree-1",
          full_name: "Partner Person",
          gender: "female",
          birth_date: "1952-05-05",
          death_date: null,
          birth_place: null,
          death_place: null,
          bio: null,
          is_living: true,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: "person-4",
          tree_id: "tree-1",
          full_name: "Shared Child",
          gender: "female",
          birth_date: "1982-02-02",
          death_date: null,
          birth_place: null,
          death_place: null,
          bio: null,
          is_living: true,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      parentLinks: [
        ...snapshot.parentLinks,
        {
          id: "link-2",
          tree_id: "tree-1",
          parent_person_id: "person-1",
          child_person_id: "person-4",
          relation_type: "biological",
          created_at: new Date().toISOString()
        },
        {
          id: "link-3",
          tree_id: "tree-1",
          parent_person_id: "person-3",
          child_person_id: "person-4",
          relation_type: "biological",
          created_at: new Date().toISOString()
        }
      ],
      partnerships: [
        {
          id: "partnership-1",
          tree_id: "tree-1",
          person_a_id: "person-1",
          person_b_id: "person-3",
          status: "married",
          start_date: null,
          end_date: null,
          created_at: new Date().toISOString()
        }
      ]
    });

    expect(tree).not.toBeNull();
    expect(tree?.type).toBe("person");
    expect(tree?.children).toHaveLength(2);
    expect(tree?.children?.[0]).toMatchObject({
      type: "couple",
      primaryId: "person-1",
      spouseId: "person-3"
    });
    expect(tree?.children?.[0]?.children?.[0]).toMatchObject({
      type: "person",
      id: "person-4"
    });
    expect(tree?.children?.[1]).toMatchObject({
      type: "person",
      id: "person-2"
    });
  });

  it("falls back to a person without parents when tree root is missing", () => {
    const tree = buildDisplayTree({
      ...snapshot,
      tree: {
        ...snapshot.tree,
        root_person_id: null
      },
      people: [
        {
          id: "person-0",
          tree_id: "tree-1",
          full_name: "Ancestor",
          gender: "male",
          birth_date: "1930-01-01",
          death_date: null,
          birth_place: null,
          death_place: null,
          bio: null,
          is_living: false,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        ...snapshot.people
      ],
      parentLinks: [
        ...snapshot.parentLinks,
        {
          id: "link-0",
          tree_id: "tree-1",
          parent_person_id: "person-0",
          child_person_id: "person-1",
          relation_type: "biological",
          created_at: new Date().toISOString()
        }
      ]
    });

    expect(tree).toMatchObject({
      type: "person",
      id: "person-0"
    });
    expect(tree?.children?.[0]).toMatchObject({
      type: "person",
      id: "person-1"
    });
  });

  it("keeps builder tree descendant-only and does not insert couple nodes", () => {
    const tree = buildBuilderDisplayTree({
      ...snapshot,
      people: [
        ...snapshot.people,
        {
          id: "person-3",
          tree_id: "tree-1",
          full_name: "Partner Person",
          gender: "female",
          birth_date: "1952-05-05",
          death_date: null,
          birth_place: null,
          death_place: null,
          bio: null,
          is_living: true,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      partnerships: [
        {
          id: "partnership-1",
          tree_id: "tree-1",
          person_a_id: "person-1",
          person_b_id: "person-3",
          status: "married",
          start_date: null,
          end_date: null,
          created_at: new Date().toISOString()
        }
      ]
    });

    expect(tree).toMatchObject({
      type: "person",
      id: "person-1"
    });
    expect(tree?.children).toHaveLength(1);
    expect(tree?.children?.[0]).toMatchObject({
      type: "person",
      id: "person-2"
    });
  });

  it("collects media for a given person", () => {
    const media = collectPersonMedia(snapshot, "person-1");
    expect(media).toHaveLength(1);
    expect(media[0]?.title).toBe("Portrait");
  });

  it("collects tree-level media that is not linked to any person", () => {
    const media = collectUnlinkedTreeMedia({
      media: [
        ...snapshot.media,
        {
          id: "media-archive",
          tree_id: "tree-1",
          kind: "photo",
          provider: "supabase_storage",
          visibility: "public",
          storage_path: "trees/tree-1/photos/media-archive/archive.jpg",
          external_url: null,
          title: "Archive",
          caption: null,
          mime_type: "image/jpeg",
          size_bytes: 2048,
          created_by: null,
          created_at: new Date().toISOString()
        }
      ],
      personMedia: snapshot.personMedia
    });

    expect(media).toHaveLength(1);
    expect(media[0]?.id).toBe("media-archive");
  });

  it("collects tree-level media by kind", () => {
    const media = collectTreeMedia(
      {
        media: [
          ...snapshot.media,
          {
            id: "media-video",
            tree_id: "tree-1",
            kind: "video",
            provider: "yandex_disk",
            visibility: "public",
            storage_path: null,
            external_url: "https://example.com/video",
            title: "Video",
            caption: null,
            mime_type: null,
            size_bytes: null,
            created_by: null,
            created_at: new Date().toISOString()
          }
        ]
      },
      "video"
    );

    expect(media).toHaveLength(1);
    expect(media[0]?.id).toBe("media-video");
  });

  it("builds album summaries filtered by media kind", () => {
    const summaries = buildTreeMediaAlbumSummaries({
      media: [
        ...snapshot.media,
        {
          id: "media-video",
          tree_id: "tree-1",
          kind: "video",
          provider: "yandex_disk",
          visibility: "public",
          storage_path: null,
          external_url: "https://example.com/video",
          title: "Video",
          caption: null,
          mime_type: null,
          size_bytes: null,
          created_by: null,
          created_at: new Date().toISOString()
        }
      ],
      albums: [
        {
          id: "album-1",
          tree_id: "tree-1",
          title: "От Виктора Петровича",
          description: null,
          album_kind: "uploader",
          uploader_user_id: "user-1",
          created_by: "user-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      items: [
        { id: "item-1", album_id: "album-1", media_id: "media-1", created_at: new Date().toISOString() },
        { id: "item-2", album_id: "album-1", media_id: "media-video", created_at: new Date().toISOString() }
      ],
      kind: "photo"
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: "album-1",
      title: "От Виктора Петровича",
      uploaderUserId: "user-1",
      count: 1,
      coverMediaId: "media-1"
    });
  });

  it("builds derived uploader album summaries from existing media", () => {
    const summaries = buildDerivedUploaderAlbumSummaries({
      media: [
        {
          ...snapshot.media[0],
          created_by: "user-1"
        },
        {
          id: "media-video",
          tree_id: "tree-1",
          kind: "video",
          provider: "yandex_disk",
          visibility: "public",
          storage_path: null,
          external_url: "https://example.com/video",
          title: "Video",
          caption: null,
          mime_type: null,
          size_bytes: null,
          created_by: "user-1",
          created_at: new Date().toISOString()
        }
      ],
      kind: "photo",
      uploaderLabelsById: new Map([["user-1", "От Виктора Петровича"]])
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: "uploader-user-1",
      title: "От Виктора Петровича",
      albumKind: "uploader",
      uploaderUserId: "user-1",
      count: 1,
      coverMediaId: "media-1"
    });
  });

  it("builds a persisted album media map", () => {
    const map = buildPersistedTreeMediaAlbumMediaMap({
      media: [
        ...snapshot.media,
        {
          id: "media-video",
          tree_id: "tree-1",
          kind: "video",
          provider: "yandex_disk",
          visibility: "public",
          storage_path: null,
          external_url: "https://example.com/video",
          title: "Video",
          caption: null,
          mime_type: null,
          size_bytes: null,
          created_by: "user-1",
          created_at: new Date().toISOString()
        }
      ],
      items: [
        { id: "item-1", album_id: "album-1", media_id: "media-1", created_at: new Date().toISOString() },
        { id: "item-2", album_id: "album-1", media_id: "media-video", created_at: new Date().toISOString() }
      ]
    });

    expect(map["album-1"]).toHaveLength(2);
    expect(map["album-1"]?.[0]?.id).toBe("media-1");
  });

  it("keeps manual albums visible in filtered mode even when the current mode has zero items", () => {
    const summaries = buildTreeMediaAlbumSummaries({
      media: [
        {
          ...snapshot.media[0],
          created_by: "user-1"
        }
      ],
      albums: [
        {
          id: "album-1",
          tree_id: "tree-1",
          title: "Семейный альбом",
          description: null,
          album_kind: "manual",
          uploader_user_id: null,
          created_by: "user-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      items: [{ id: "item-1", album_id: "album-1", media_id: "media-1", created_at: new Date().toISOString() }],
      kind: "video"
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: "album-1",
      title: "Семейный альбом",
      count: 0,
      coverMediaId: "media-1"
    });
  });

  it("builds preview photo URLs per person and prefers primary photos", () => {
    const urls = buildPersonPhotoPreviewUrls({
      media: [
        ...snapshot.media,
        {
          id: "media-2",
          tree_id: "tree-1",
          kind: "photo",
          provider: "supabase_storage",
          visibility: "public",
          storage_path: "trees/tree-1/photos/media-2/root-second.jpg",
          external_url: null,
          title: "Portrait 2",
          caption: null,
          mime_type: "image/jpeg",
          size_bytes: 1024,
          created_by: null,
          created_at: new Date().toISOString()
        },
        {
          id: "media-3",
          tree_id: "tree-1",
          kind: "video",
          provider: "yandex_disk",
          visibility: "public",
          storage_path: null,
          external_url: "https://disk.yandex.example/video",
          title: "Video",
          caption: null,
          mime_type: null,
          size_bytes: null,
          created_by: null,
          created_at: new Date().toISOString()
        }
      ],
      personMedia: [
        { id: "pm-2", person_id: "person-1", media_id: "media-2", is_primary: false },
        { id: "pm-3", person_id: "person-1", media_id: "media-1", is_primary: true },
        { id: "pm-4", person_id: "person-2", media_id: "media-3", is_primary: true }
      ]
    });

    expect(urls).toMatchObject({
      "person-1": "/api/media/media-1?variant=thumb"
    });
    expect(urls["person-2"]).toBeUndefined();
  });

  it("builds preview and explicit-open URLs with consistent variant semantics", () => {
    const freshPhoto = {
      id: "media-fresh",
      tree_id: "tree-1",
      kind: "photo" as const,
      provider: "object_storage" as const,
      visibility: "public" as const,
      storage_path: "trees/tree-1/media/photo/media-fresh/original.jpg",
      external_url: null,
      title: "Fresh photo",
      caption: null,
      mime_type: "image/jpeg",
      size_bytes: 2048,
      created_by: null,
      created_at: "2026-03-09T00:00:00.000Z"
    };
    const legacyPhoto = {
      ...freshPhoto,
      id: "media-legacy",
      created_at: "2026-03-07T00:00:00.000Z"
    };

    expect(buildPhotoPreviewRouteUrl(freshPhoto, "small")).toBe("/api/media/media-fresh?variant=small");
    expect(buildPhotoPreviewRouteUrl(freshPhoto, "thumb", "share-token")).toBe("/api/media/media-fresh?variant=thumb&share=share-token");
    expect(buildPhotoPreviewRouteUrl(legacyPhoto, "small")).toBe("/api/media/media-legacy");
    expect(buildMediaOpenRouteUrl(freshPhoto)).toBe("/api/media/media-fresh");
    expect(buildMediaOpenRouteUrl(freshPhoto, "share-token")).toBe("/api/media/media-fresh?share=share-token");
  });
});
