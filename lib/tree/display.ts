import type { DisplayTreeNode, MediaAssetRecord, MediaKind, MediaVariantName, ParentLinkRecord, PartnershipRecord, TreeMediaAlbumItemRecord, TreeMediaAlbumRecord, TreeSnapshot } from "@/lib/types";

const PHOTO_VARIANT_ROLLOUT_AT_MS = Date.parse("2026-03-08T00:00:00Z");

function compareNullableDate(a?: string | null, b?: string | null) {
  if (a && b) {
    return a.localeCompare(b);
  }
  if (a) {
    return -1;
  }
  if (b) {
    return 1;
  }
  return 0;
}

function uniqueIds(values: string[]) {
  return [...new Set(values)];
}

export function shouldUsePhotoVariants(createdAt?: string | null) {
  if (!createdAt) {
    return false;
  }

  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) && parsed >= PHOTO_VARIANT_ROLLOUT_AT_MS;
}

export function withMediaShareToken(url: string, shareToken?: string | null) {
  if (!shareToken) {
    return url;
  }

  const [pathname, queryString] = url.split("?");
  const params = new URLSearchParams(queryString || "");
  params.set("share", shareToken);
  const nextQueryString = params.toString();
  return nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
}

export function buildMediaRouteUrl(
  mediaId: string,
  options?: {
    shareToken?: string | null;
    variant?: MediaVariantName | null;
  }
) {
  const params = new URLSearchParams();
  if (options?.variant) {
    params.set("variant", options.variant);
  }

  const baseUrl = params.size ? `/api/media/${mediaId}?${params.toString()}` : `/api/media/${mediaId}`;
  return withMediaShareToken(baseUrl, options?.shareToken);
}

export function buildMediaOpenRouteUrl(
  asset: Pick<MediaAssetRecord, "id">,
  shareToken?: string | null,
) {
  return buildMediaRouteUrl(asset.id, { shareToken });
}

export function buildPhotoPreviewRouteUrl(
  asset: Pick<MediaAssetRecord, "id" | "kind" | "created_at">,
  variant: MediaVariantName,
  shareToken?: string | null,
) {
  if (asset.kind === "photo" && shouldUsePhotoVariants(asset.created_at)) {
    return buildMediaRouteUrl(asset.id, { shareToken, variant });
  }

  return buildMediaRouteUrl(asset.id, { shareToken });
}

export function buildDisplayTree(snapshot: TreeSnapshot): DisplayTreeNode | null {
  const peopleById = new Map(snapshot.people.map((person) => [person.id, person]));
  if (!peopleById.size) {
    return null;
  }

  const childrenByParent = new Map<string, ParentLinkRecord[]>();
  const parentLinksByChild = new Map<string, ParentLinkRecord[]>();
  const partnershipsByPerson = new Map<string, PartnershipRecord[]>();

  function comparePersonIds(personAId: string, personBId: string) {
    const personA = peopleById.get(personAId);
    const personB = peopleById.get(personBId);
    if (!personA || !personB) {
      return personAId.localeCompare(personBId);
    }

    return (
      compareNullableDate(personA.birth_date, personB.birth_date) ||
      personA.full_name.localeCompare(personB.full_name, "ru") ||
      personA.id.localeCompare(personB.id)
    );
  }

  function sortParentLinksByChild(left: ParentLinkRecord, right: ParentLinkRecord) {
    return comparePersonIds(left.child_person_id, right.child_person_id);
  }

  function sortPartnerships(left: PartnershipRecord, right: PartnershipRecord, anchorPersonId: string) {
    const leftPartnerId = left.person_a_id === anchorPersonId ? left.person_b_id : left.person_a_id;
    const rightPartnerId = right.person_a_id === anchorPersonId ? right.person_b_id : right.person_a_id;
    return comparePersonIds(leftPartnerId, rightPartnerId);
  }

  snapshot.parentLinks.forEach((link) => {
    const nextChildren = childrenByParent.get(link.parent_person_id) || [];
    nextChildren.push(link);
    nextChildren.sort(sortParentLinksByChild);
    childrenByParent.set(link.parent_person_id, nextChildren);

    const nextParents = parentLinksByChild.get(link.child_person_id) || [];
    nextParents.push(link);
    parentLinksByChild.set(link.child_person_id, nextParents);
  });

  snapshot.partnerships.forEach((partnership) => {
    const firstSide = partnershipsByPerson.get(partnership.person_a_id) || [];
    firstSide.push(partnership);
    firstSide.sort((left, right) => sortPartnerships(left, right, partnership.person_a_id));
    partnershipsByPerson.set(partnership.person_a_id, firstSide);

    const secondSide = partnershipsByPerson.get(partnership.person_b_id) || [];
    secondSide.push(partnership);
    secondSide.sort((left, right) => sortPartnerships(left, right, partnership.person_b_id));
    partnershipsByPerson.set(partnership.person_b_id, secondSide);
  });

  const sharedChildrenByPartnership = new Map<string, string[]>();
  snapshot.partnerships.forEach((partnership) => {
    const firstChildren = new Set((childrenByParent.get(partnership.person_a_id) || []).map((link) => link.child_person_id));
    const secondChildren = new Set((childrenByParent.get(partnership.person_b_id) || []).map((link) => link.child_person_id));
    const sharedChildren = [...firstChildren].filter((childId) => secondChildren.has(childId)).sort(comparePersonIds);
    sharedChildrenByPartnership.set(partnership.id, sharedChildren);
  });

  const rootId =
    (snapshot.tree.root_person_id && peopleById.has(snapshot.tree.root_person_id) ? snapshot.tree.root_person_id : null) ||
    [...snapshot.people]
      .filter((person) => !(parentLinksByChild.get(person.id) || []).length)
      .sort((left, right) => comparePersonIds(left.id, right.id))[0]?.id ||
    [...snapshot.people].sort((left, right) => comparePersonIds(left.id, right.id))[0]?.id;

  if (!rootId) {
    return null;
  }

  function walkPerson(personId: string, seenPeople: Set<string>, seenPartnerships: Set<string>): DisplayTreeNode | null {
    if (seenPeople.has(personId)) {
      return null;
    }

    const person = peopleById.get(personId);
    if (!person) {
      return null;
    }

    const nextSeenPeople = new Set(seenPeople);
    nextSeenPeople.add(personId);

    let scopedSeenPartnerships = new Set(seenPartnerships);
    const sharedChildIds = new Set<string>();
    const relationshipBranches: DisplayTreeNode[] = [];

    for (const partnership of partnershipsByPerson.get(personId) || []) {
      if (scopedSeenPartnerships.has(partnership.id)) {
        continue;
      }

      const partnerId = partnership.person_a_id === personId ? partnership.person_b_id : partnership.person_a_id;
      const partner = peopleById.get(partnerId);
      if (!partner) {
        continue;
      }

      const nextSeenPartnerships = new Set(scopedSeenPartnerships);
      nextSeenPartnerships.add(partnership.id);
      scopedSeenPartnerships = nextSeenPartnerships;

      const sharedChildren = (sharedChildrenByPartnership.get(partnership.id) || [])
        .map((childId) => {
          sharedChildIds.add(childId);
          return walkPerson(childId, nextSeenPeople, nextSeenPartnerships);
        })
        .filter(Boolean) as DisplayTreeNode[];

      relationshipBranches.push({
        type: "couple",
        primaryId: person.id,
        partnershipId: partnership.id,
        spouseId: partner.id,
        name: person.full_name,
        spouseName: partner.full_name,
        gender: person.gender,
        spouseGender: partner.gender,
        birthDate: person.birth_date,
        deathDate: person.death_date,
        spouseBirthDate: partner.birth_date,
        spouseDeathDate: partner.death_date,
        children: sharedChildren
      });
    }

    const soloChildren = uniqueIds((childrenByParent.get(personId) || []).map((link) => link.child_person_id))
      .filter((childId) => !sharedChildIds.has(childId))
      .sort(comparePersonIds)
      .map((childId) => walkPerson(childId, nextSeenPeople, scopedSeenPartnerships))
      .filter(Boolean) as DisplayTreeNode[];

    return {
      type: "person",
      id: person.id,
      name: person.full_name,
      gender: person.gender,
      birthDate: person.birth_date,
      deathDate: person.death_date,
      children: [...relationshipBranches, ...soloChildren]
    };
  }

  return walkPerson(rootId, new Set(), new Set());
}

export function buildBuilderDisplayTree(snapshot: TreeSnapshot): DisplayTreeNode | null {
  const peopleById = new Map(snapshot.people.map((person) => [person.id, person]));
  if (!peopleById.size) {
    return null;
  }

  const childrenByParent = new Map<string, ParentLinkRecord[]>();
  const parentLinksByChild = new Map<string, ParentLinkRecord[]>();

  function comparePersonIds(personAId: string, personBId: string) {
    const personA = peopleById.get(personAId);
    const personB = peopleById.get(personBId);
    if (!personA || !personB) {
      return personAId.localeCompare(personBId);
    }

    return (
      compareNullableDate(personA.birth_date, personB.birth_date) ||
      personA.full_name.localeCompare(personB.full_name, "ru") ||
      personA.id.localeCompare(personB.id)
    );
  }

  snapshot.parentLinks.forEach((link) => {
    const nextChildren = childrenByParent.get(link.parent_person_id) || [];
    nextChildren.push(link);
    nextChildren.sort((left, right) => comparePersonIds(left.child_person_id, right.child_person_id));
    childrenByParent.set(link.parent_person_id, nextChildren);

    const nextParents = parentLinksByChild.get(link.child_person_id) || [];
    nextParents.push(link);
    parentLinksByChild.set(link.child_person_id, nextParents);
  });

  const rootId =
    (snapshot.tree.root_person_id && peopleById.has(snapshot.tree.root_person_id) ? snapshot.tree.root_person_id : null) ||
    [...snapshot.people]
      .filter((person) => !(parentLinksByChild.get(person.id) || []).length)
      .sort((left, right) => comparePersonIds(left.id, right.id))[0]?.id ||
    [...snapshot.people].sort((left, right) => comparePersonIds(left.id, right.id))[0]?.id;

  if (!rootId) {
    return null;
  }

  function walkPerson(personId: string, seenPeople: Set<string>): DisplayTreeNode | null {
    if (seenPeople.has(personId)) {
      return null;
    }

    const person = peopleById.get(personId);
    if (!person) {
      return null;
    }

    const nextSeenPeople = new Set(seenPeople);
    nextSeenPeople.add(personId);

    const children = uniqueIds((childrenByParent.get(personId) || []).map((link) => link.child_person_id))
      .sort(comparePersonIds)
      .map((childId) => walkPerson(childId, nextSeenPeople))
      .filter(Boolean) as DisplayTreeNode[];

    return {
      type: "person",
      id: person.id,
      name: person.full_name,
      gender: person.gender,
      birthDate: person.birth_date,
      deathDate: person.death_date,
      children
    };
  }

  return walkPerson(rootId, new Set());
}

export function collectPersonMedia(snapshot: TreeSnapshot, personId: string) {
  const mediaIds = snapshot.personMedia.filter((relation) => relation.person_id === personId).map((relation) => relation.media_id);
  return snapshot.media.filter((asset) => mediaIds.includes(asset.id));
}

export function collectTreeMedia(snapshot: Pick<TreeSnapshot, "media">, kind?: Extract<MediaKind, "photo" | "video">) {
  if (!kind) {
    return snapshot.media;
  }

  return snapshot.media.filter((asset) => asset.kind === kind);
}

export function collectUnlinkedTreeMedia(snapshot: Pick<TreeSnapshot, "media" | "personMedia">) {
  const linkedMediaIds = new Set(snapshot.personMedia.map((relation) => relation.media_id));
  return snapshot.media.filter((asset) => !linkedMediaIds.has(asset.id));
}

export function buildTreeMediaAlbumSummaries(input: {
  media: TreeSnapshot["media"];
  albums: TreeMediaAlbumRecord[];
  items: TreeMediaAlbumItemRecord[];
  albumMediaMap?: Record<string, TreeSnapshot["media"]>;
  kind?: Extract<MediaKind, "photo" | "video">;
}) {
  const mediaById = new Map(input.media.map((asset) => [asset.id, asset] as const));
  const albumMediaIdsByAlbumId = new Map<string, string[]>();

  if (!input.albumMediaMap) {
    for (const item of input.items) {
      const current = albumMediaIdsByAlbumId.get(item.album_id) || [];
      current.push(item.media_id);
      albumMediaIdsByAlbumId.set(item.album_id, current);
    }
  }

  return input.albums
    .map((album) => {
      const albumAllMedia =
        input.albumMediaMap?.[album.id] ||
        (albumMediaIdsByAlbumId.get(album.id) || [])
          .map((mediaId) => mediaById.get(mediaId))
          .filter(Boolean) as TreeSnapshot["media"];
      const albumMedia = albumAllMedia.filter((asset) => !input.kind || asset.kind === input.kind);
      const cover =
        albumMedia.find((asset) => asset.kind === "photo") ||
        albumAllMedia.find((asset) => asset.kind === "photo") ||
        albumMedia[0] ||
        albumAllMedia[0];

      return {
        id: album.id,
        title: album.title,
        description: album.description,
        albumKind: album.album_kind,
        uploaderUserId: album.uploader_user_id,
        count: albumMedia.length,
        coverMediaId: cover?.id || null
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    title: string;
    description: string | null;
    albumKind: TreeMediaAlbumRecord["album_kind"];
    uploaderUserId: string | null;
    count: number;
    coverMediaId: string | null;
  }>;
}

export function buildDerivedUploaderAlbumSummaries(input: {
  media: TreeSnapshot["media"];
  kind?: Extract<MediaKind, "photo" | "video">;
  uploaderLabelsById: Map<string, string>;
}) {
  const grouped = new Map<string, TreeSnapshot["media"]>();

  for (const asset of input.media) {
    if (!asset.created_by) {
      continue;
    }
    if (input.kind && asset.kind !== input.kind) {
      continue;
    }

    const current = grouped.get(asset.created_by) || [];
    current.push(asset);
    grouped.set(asset.created_by, current);
  }

  return [...grouped.entries()].map(([userId, media]) => {
    const cover = media.find((asset) => asset.kind === "photo") || media[0];
    const label = input.uploaderLabelsById.get(userId) || "От участника";

    return {
      id: `uploader-${userId}`,
      title: label,
      description: null,
      albumKind: "uploader" as const,
      uploaderUserId: userId,
      count: media.length,
      coverMediaId: cover?.id || null
    };
  });
}

export function buildPersistedTreeMediaAlbumMediaMap(input: {
  media: TreeSnapshot["media"];
  items: TreeMediaAlbumItemRecord[];
}) {
  const mediaById = new Map(input.media.map((asset) => [asset.id, asset] as const));
  const result: Record<string, TreeSnapshot["media"]> = {};

  for (const item of input.items) {
    const media = mediaById.get(item.media_id);
    if (!media) {
      continue;
    }

    const current = result[item.album_id] || [];
    current.push(media);
    result[item.album_id] = current;
  }

  return result;
}

export function buildPersonPhotoPreviewUrls(snapshot: Pick<TreeSnapshot, "media" | "personMedia">) {
  const photoMediaIds = new Set(
    snapshot.media.filter((asset) => asset.kind === "photo").map((asset) => asset.id)
  );
  const sortedRelations = [...snapshot.personMedia].sort((left, right) => Number(right.is_primary) - Number(left.is_primary));
  const result: Record<string, string> = {};

  for (const relation of sortedRelations) {
    if (result[relation.person_id]) {
      continue;
    }

    if (!photoMediaIds.has(relation.media_id)) {
      continue;
    }

    const asset = snapshot.media.find((item) => item.id === relation.media_id);
    result[relation.person_id] = asset
      ? buildPhotoPreviewRouteUrl(asset, "thumb")
      : buildMediaRouteUrl(relation.media_id);
  }

  return result;
}
