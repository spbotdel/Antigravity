import type { DisplayTreeNode, ParentLinkRecord, PartnershipRecord, TreeSnapshot } from "@/lib/types";

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

    result[relation.person_id] = `/api/media/${relation.media_id}?variant=thumb`;
  }

  return result;
}
