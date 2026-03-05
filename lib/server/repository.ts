import type {
  AuditEntry,
  AuditEntryView,
  InviteRecord,
  MediaAssetRecord,
  MembershipRecord,
  PersonMediaRecord,
  PersonRecord,
  PartnershipRecord,
  ParentLinkRecord,
  Profile,
  TreeRecord,
  TreeSnapshot,
  UserRole,
  ViewerActor
} from "@/lib/types";
import { buildAuditEntryViews } from "@/lib/audit-presenter";
import { buildViewerActor, canSeeMedia, canViewTree, hasRequiredRole } from "@/lib/permissions";
import { getBaseUrl, getStorageBucket } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { fetchSupabaseAdminRestBatchJson, fetchSupabaseAdminRestJson } from "@/lib/supabase/admin-rest";
import { getCurrentUser, requireAuthenticatedUserId } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";
import { createInviteToken, hashInviteToken } from "@/lib/server/invite-token";

const admin = () => createAdminSupabaseClient();

const REPOSITORY_NETWORK_ERROR_MARKERS = ["SUPABASE_UNAVAILABLE", "fetch failed", "connect timeout", "timed out", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"];

function toRepositoryReadError(error: unknown, fallbackMessage: string) {
  if (error instanceof AppError) {
    return error;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  if (REPOSITORY_NETWORK_ERROR_MARKERS.some((marker) => message.includes(marker))) {
    return new AppError(503, "Сервер не смог связаться с Supabase. Попробуйте еще раз.");
  }

  return new AppError(500, message || fallbackMessage);
}

function buildUuidInFilter(values: string[]) {
  return `(${[...new Set(values.filter(Boolean))].join(",")})`;
}

async function fetchAdminRows<T>(pathWithQuery: string, fallbackMessage: string) {
  try {
    const data = await fetchSupabaseAdminRestJson<T[]>(pathWithQuery);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw toRepositoryReadError(error, fallbackMessage);
  }
}

async function fetchAdminFirst<T>(pathWithQuery: string, fallbackMessage: string) {
  const rows = await fetchAdminRows<T>(`${pathWithQuery}${pathWithQuery.includes("?") ? "&" : "?"}limit=1`, fallbackMessage);
  return rows[0] ?? null;
}

async function mutateAdminRows<T>(pathWithQuery: string, method: "POST" | "PATCH" | "DELETE", body: unknown, fallbackMessage: string) {
  try {
    const data = await fetchSupabaseAdminRestJson<T[] | null>(pathWithQuery, { method, body });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw toRepositoryReadError(error, fallbackMessage);
  }
}

async function mutateAdminFirst<T>(pathWithQuery: string, method: "POST" | "PATCH", body: unknown, fallbackMessage: string) {
  const rows = await mutateAdminRows<T>(pathWithQuery, method, body, fallbackMessage);
  return rows[0] ?? null;
}

async function getAuthenticatedUserId() {
  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    throw new AppError(401, "Требуется авторизация.");
  }

  return userId;
}

export async function getTreeBySlug(slug: string) {
  const data = await fetchAdminFirst<TreeRecord>(
    `trees?select=*&slug=eq.${encodeURIComponent(slug)}`,
    "Не удалось загрузить семейное дерево."
  );

  if (!data) {
    throw new AppError(404, "Семейное дерево не найдено.");
  }

  return data;
}

export async function getTreeById(treeId: string) {
  const data = await fetchAdminFirst<TreeRecord>(
    `trees?select=*&id=eq.${encodeURIComponent(treeId)}`,
    "Не удалось загрузить семейное дерево."
  );

  if (!data) {
    throw new AppError(404, "Семейное дерево не найдено.");
  }

  return data;
}

export async function getMembership(treeId: string, userId: string) {
  return fetchAdminFirst<MembershipRecord>(
    `tree_memberships?select=*&tree_id=eq.${encodeURIComponent(treeId)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`,
    "Не удалось проверить права доступа к дереву."
  );
}

export async function requireTreeRole(treeId: string, allowedRoles: UserRole[]) {
  const userId = await getAuthenticatedUserId();
  const membership = await getMembership(treeId, userId);

  if (!membership || !hasRequiredRole(membership.role, allowedRoles)) {
    throw new AppError(403, "У вас нет доступа к этому действию в дереве.");
  }

  return { userId, membership };
}

export async function getActorForTree(treeId: string): Promise<ViewerActor> {
  const user = await getCurrentUser();
  if (!user) {
    return buildViewerActor(null, null);
  }

  const membership = await getMembership(treeId, user.id);
  return buildViewerActor(user.id, membership?.role ?? null);
}

export async function listUserTrees(userId: string) {
  const { data: memberships, error: membershipError } = await admin()
    .from("tree_memberships")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .returns<MembershipRecord[]>();

  if (membershipError) {
    throw new AppError(500, membershipError.message);
  }

  if (!memberships?.length) {
    return [];
  }

  const treeIds = memberships.map((item) => item.tree_id);
  const { data: trees, error: treesError } = await admin().from("trees").select("*").in("id", treeIds).returns<TreeRecord[]>();

  if (treesError) {
    throw new AppError(500, treesError.message);
  }

  return memberships
    .map((membership) => ({
      membership,
      tree: trees?.find((tree) => tree.id === membership.tree_id) ?? null
    }))
    .filter((item) => item.tree !== null);
}

async function insertAuditLog(input: {
  treeId: string;
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
}) {
  await mutateAdminRows<never>(
    "audit_log",
    "POST",
    {
      tree_id: input.treeId,
      actor_user_id: input.actorUserId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      before_json: input.beforeJson,
      after_json: input.afterJson
    },
    "Не удалось записать событие в журнал изменений."
  );
}

function queueAuditLog(input: {
  treeId: string;
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
}) {
  void insertAuditLog(input).catch((error) => {
    console.error("[audit-log] best-effort insert failed", error);
  });
}

export async function createTreeForOwner(input: { title: string; slug: string; description?: string | null }) {
  const userId = await getAuthenticatedUserId();

  const { data: existingOwned, error: existingError } = await admin().from("trees").select("id").eq("owner_user_id", userId).limit(1);

  if (existingError) {
    throw new AppError(500, existingError.message);
  }

  if (existingOwned && existingOwned.length > 0) {
    throw new AppError(409, "В версии v1 владелец может создать только одно дерево.");
  }

  const { data: tree, error: treeError } = await admin()
    .from("trees")
    .insert({
      owner_user_id: userId,
      title: input.title,
      slug: input.slug,
      description: input.description || null,
      visibility: "private"
    })
    .select("*")
    .single<TreeRecord>();

  if (treeError || !tree) {
    throw new AppError(400, treeError?.message || "Не удалось создать дерево.");
  }

  const { error: membershipError } = await admin().from("tree_memberships").insert({
    tree_id: tree.id,
    user_id: userId,
    role: "owner",
    status: "active"
  });

  if (membershipError) {
    throw new AppError(500, membershipError.message);
  }

  await insertAuditLog({
    treeId: tree.id,
    actorUserId: userId,
    entityType: "tree",
    entityId: tree.id,
    action: "tree.created",
    beforeJson: null,
    afterJson: tree
  });

  return tree;
}

export async function updateTree(treeId: string, input: { title?: string; slug?: string; description?: string | null; rootPersonId?: string | null }) {
  const { userId } = await requireTreeRole(treeId, ["owner"]);
  const before = await getTreeById(treeId);

  const payload = {
    title: input.title ?? before.title,
    slug: input.slug ?? before.slug,
    description: input.description === undefined ? before.description : input.description,
    root_person_id: input.rootPersonId === undefined ? before.root_person_id : input.rootPersonId
  };

  const data = await mutateAdminFirst<TreeRecord>(
    `trees?id=eq.${encodeURIComponent(treeId)}&select=*`,
    "PATCH",
    payload,
    "Не удалось обновить дерево."
  );

  if (!data) {
    throw new AppError(400, "Не удалось обновить дерево.");
  }

  await insertAuditLog({
    treeId,
    actorUserId: userId,
    entityType: "tree",
    entityId: treeId,
    action: "tree.updated",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

export async function updateTreeVisibility(treeId: string, visibility: TreeRecord["visibility"]) {
  const { userId } = await requireTreeRole(treeId, ["owner"]);
  const before = await getTreeById(treeId);

  const data = await mutateAdminFirst<TreeRecord>(
    `trees?id=eq.${encodeURIComponent(treeId)}&select=*`,
    "PATCH",
    { visibility },
    "Не удалось изменить видимость дерева."
  );

  if (!data) {
    throw new AppError(400, "Не удалось изменить видимость дерева.");
  }

  await insertAuditLog({
    treeId,
    actorUserId: userId,
    entityType: "tree",
    entityId: treeId,
    action: "tree.visibility_changed",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

async function loadTreeSnapshot(slug: string, options?: { includeMedia?: boolean }): Promise<TreeSnapshot> {
  const includeMedia = options?.includeMedia ?? true;
  const [tree, user] = await Promise.all([getTreeBySlug(slug), getCurrentUser()]);

  const batchedRequests: Array<{ key: string; pathWithQuery: string }> = [
    {
      key: "people",
      pathWithQuery: `persons?select=*&tree_id=eq.${encodeURIComponent(tree.id)}&order=full_name.asc`
    },
    {
      key: "parentLinks",
      pathWithQuery: `person_parent_links?select=*&tree_id=eq.${encodeURIComponent(tree.id)}`
    },
    {
      key: "partnerships",
      pathWithQuery: `person_partnerships?select=*&tree_id=eq.${encodeURIComponent(tree.id)}`
    }
  ];

  if (user) {
    batchedRequests.unshift({
      key: "membership",
      pathWithQuery: `tree_memberships?select=*&tree_id=eq.${encodeURIComponent(tree.id)}&user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=1`
    });
  }

  if (includeMedia) {
    batchedRequests.push({
      key: "media",
      pathWithQuery: `media_assets?select=*&tree_id=eq.${encodeURIComponent(tree.id)}&order=created_at.desc`
    });
  }

  const batchedResults = await fetchSupabaseAdminRestBatchJson<unknown>(batchedRequests);
  const batchedRowsByKey = new Map(batchedRequests.map((request, index) => [request.key, batchedResults[index]] as const));
  const membership = user ? ((batchedRowsByKey.get("membership") as MembershipRecord[] | undefined)?.[0] ?? null) : null;

  if (!canViewTree(tree.visibility, membership)) {
    throw new AppError(403, "Это закрытое дерево. Войдите в аккаунт по приглашению.");
  }

  const actor = buildViewerActor(user?.id ?? null, membership?.role ?? null);
  const people = (batchedRowsByKey.get("people") as PersonRecord[] | undefined) || [];
  const parentLinks = (batchedRowsByKey.get("parentLinks") as ParentLinkRecord[] | undefined) || [];
  const partnerships = (batchedRowsByKey.get("partnerships") as PartnershipRecord[] | undefined) || [];
  const allMedia = includeMedia ? ((batchedRowsByKey.get("media") as MediaAssetRecord[] | undefined) || []) : [];

  const media = allMedia.filter((item) => canSeeMedia(actor.role, item.visibility));
  const visibleMediaIds = media.map((item) => item.id);
  const personMedia =
    includeMedia && visibleMediaIds.length > 0
      ? await fetchAdminRows<PersonMediaRecord>(
          `person_media?select=id,person_id,media_id,is_primary&media_id=in.${buildUuidInFilter(visibleMediaIds)}`,
          "Не удалось загрузить связи людей с медиафайлами."
        )
      : [];

  return {
    tree,
    actor,
    people,
    parentLinks,
    partnerships,
    media,
    personMedia
  };
}

export async function getTreeSnapshot(slug: string, options?: { includeMedia?: boolean }): Promise<TreeSnapshot> {
  return loadTreeSnapshot(slug, options);
}

export async function getBuilderSnapshot(slug: string, options?: { includeMedia?: boolean }): Promise<TreeSnapshot> {
  return loadTreeSnapshot(slug, {
    includeMedia: options?.includeMedia ?? false
  });
}

export async function listMemberships(treeId: string) {
  await requireTreeRole(treeId, ["owner", "admin"]);
  return fetchAdminRows<MembershipRecord>(
    `tree_memberships?select=*&tree_id=eq.${encodeURIComponent(treeId)}&order=created_at.asc`,
    "Не удалось загрузить список участников."
  );
}

export async function listInvites(treeId: string) {
  await requireTreeRole(treeId, ["owner", "admin"]);
  return fetchAdminRows<InviteRecord>(
    `tree_invites?select=*&tree_id=eq.${encodeURIComponent(treeId)}&order=created_at.desc`,
    "Не удалось загрузить приглашения."
  );
}

export async function listAudit(treeId: string): Promise<AuditEntryView[]> {
  await requireTreeRole(treeId, ["owner"]);
  const entries = await fetchAdminRows<AuditEntry>(
    `audit_log?select=*&tree_id=eq.${encodeURIComponent(treeId)}&order=created_at.desc`,
    "Не удалось загрузить журнал изменений."
  );
  if (!entries.length) {
    return [];
  }

  const relatedUserIds = new Set<string>();
  const relatedPersonIds = new Set<string>();

  for (const entry of entries) {
    if (entry.actor_user_id) {
      relatedUserIds.add(entry.actor_user_id);
    }

    for (const snapshot of [entry.before_json, entry.after_json]) {
      if (!snapshot) {
        continue;
      }

      const userId = typeof snapshot.user_id === "string" ? snapshot.user_id : null;
      if (userId) {
        relatedUserIds.add(userId);
      }

      const personKeys = ["root_person_id", "parent_person_id", "child_person_id", "person_a_id", "person_b_id"];
      for (const key of personKeys) {
        const value = typeof snapshot[key] === "string" ? snapshot[key] : null;
        if (value) {
          relatedPersonIds.add(value);
        }
      }
    }
  }

  const userIds = [...relatedUserIds];
  const personIds = [...relatedPersonIds];

  const [profilesRes, membershipsRes, personsRes] = await Promise.all([
    userIds.length
      ? fetchAdminRows<Profile>(
          `profiles?select=id,email,display_name,created_at&id=in.${buildUuidInFilter(userIds)}`,
          "Не удалось загрузить профили участников."
        )
      : Promise.resolve([] as Profile[]),
    userIds.length
      ? fetchAdminRows<MembershipRecord>(
          `tree_memberships?select=*&tree_id=eq.${encodeURIComponent(treeId)}&user_id=in.${buildUuidInFilter(userIds)}`,
          "Не удалось загрузить роли участников."
        )
      : Promise.resolve([] as MembershipRecord[]),
    personIds.length
      ? fetchAdminRows<Pick<PersonRecord, "id" | "full_name">>(
          `persons?select=id,full_name&id=in.${buildUuidInFilter(personIds)}`,
          "Не удалось загрузить имена людей из журнала."
        )
      : Promise.resolve([] as Array<Pick<PersonRecord, "id" | "full_name">>)
  ]);

  const profiles = profilesRes || [];
  const memberships = membershipsRes || [];
  const persons = personsRes || [];

  const profileById = new Map(profiles.map((profile) => [profile.id, profile] as const));
  const membershipByUserId = new Map(memberships.map((membership) => [membership.user_id, membership] as const));
  const usersById = new Map(
    userIds.map((userId) => {
      const profile = profileById.get(userId) || null;
      const membership = membershipByUserId.get(userId) || null;

      return [
        userId,
        {
          name: profile?.display_name || profile?.email || `Пользователь ${userId.slice(0, 8)}`,
          email: profile?.email || null,
          role: membership?.role || null,
          status: membership?.status || null
        }
      ] as const;
    })
  );

  const personNamesById = new Map(persons.map((person) => [person.id, person.full_name] as const));

  return buildAuditEntryViews(entries, { usersById, personNamesById });
}

export async function createPerson(input: {
  treeId: string;
  fullName: string;
  gender?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  birthPlace?: string | null;
  deathPlace?: string | null;
  bio?: string | null;
  isLiving: boolean;
}) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);

  const payload = {
    tree_id: input.treeId,
    full_name: input.fullName,
    gender: input.gender || null,
    birth_date: input.birthDate || null,
    death_date: input.deathDate || null,
    birth_place: input.birthPlace || null,
    death_place: input.deathPlace || null,
    bio: input.bio || null,
    is_living: input.isLiving,
    created_by: userId
  };

  const data = await mutateAdminFirst<PersonRecord>("persons", "POST", payload, "Не удалось создать запись о человеке.");
  if (!data) {
    throw new AppError(400, "Не удалось создать запись о человеке.");
  }

  queueAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "person",
    entityId: data.id,
    action: "person.created",
    beforeJson: null,
    afterJson: data
  });

  return data;
}

export async function updatePerson(
  personId: string,
  input: Partial<{
    fullName: string;
    gender: string | null;
    birthDate: string | null;
    deathDate: string | null;
    birthPlace: string | null;
    deathPlace: string | null;
    bio: string | null;
    isLiving: boolean;
  }>
) {
  const before = await fetchAdminFirst<PersonRecord>(
    `persons?select=*&id=eq.${encodeURIComponent(personId)}`,
    "Не удалось загрузить данные человека."
  );
  if (!before) throw new AppError(404, "Человек не найден.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  const payload = {
    full_name: input.fullName ?? before.full_name,
    gender: input.gender === undefined ? before.gender : input.gender,
    birth_date: input.birthDate === undefined ? before.birth_date : input.birthDate,
    death_date: input.deathDate === undefined ? before.death_date : input.deathDate,
    birth_place: input.birthPlace === undefined ? before.birth_place : input.birthPlace,
    death_place: input.deathPlace === undefined ? before.death_place : input.deathPlace,
    bio: input.bio === undefined ? before.bio : input.bio,
    is_living: input.isLiving === undefined ? before.is_living : input.isLiving
  };

  const data = await mutateAdminFirst<PersonRecord>(
    `persons?id=eq.${encodeURIComponent(personId)}`,
    "PATCH",
    payload,
    "Не удалось обновить данные человека."
  );
  if (!data) throw new AppError(400, "Не удалось обновить данные человека.");

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "person",
    entityId: personId,
    action: "person.updated",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

export async function deletePerson(personId: string) {
  const before = await fetchAdminFirst<PersonRecord>(
    `persons?select=*&id=eq.${encodeURIComponent(personId)}`,
    "Не удалось загрузить данные человека."
  );
  if (!before) throw new AppError(404, "Человек не найден.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  await mutateAdminRows<never>(
    `persons?id=eq.${encodeURIComponent(personId)}`,
    "DELETE",
    undefined,
    "Не удалось удалить запись о человеке."
  );

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "person",
    entityId: personId,
    action: "person.deleted",
    beforeJson: before,
    afterJson: null
  });
}

export async function createParentLink(input: { treeId: string; parentPersonId: string; childPersonId: string; relationType: string }) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);
  const data = await mutateAdminFirst<ParentLinkRecord>(
    "person_parent_links",
    "POST",
    {
      tree_id: input.treeId,
      parent_person_id: input.parentPersonId,
      child_person_id: input.childPersonId,
      relation_type: input.relationType
    },
    "Не удалось создать связь родитель-ребенок."
  );

  if (!data) throw new AppError(400, "Не удалось создать связь родитель-ребенок.");

  queueAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "parent_link",
    entityId: data.id,
    action: "relationship.parent_child_created",
    beforeJson: null,
    afterJson: data
  });

  return data;
}

export async function deleteParentLink(linkId: string) {
  const before = await fetchAdminFirst<ParentLinkRecord>(
    `person_parent_links?select=*&id=eq.${encodeURIComponent(linkId)}`,
    "Не удалось загрузить связь родитель-ребенок."
  );
  if (!before) throw new AppError(404, "Связь не найдена.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  await mutateAdminRows<never>(
    `person_parent_links?id=eq.${encodeURIComponent(linkId)}`,
    "DELETE",
    undefined,
    "Не удалось удалить связь родитель-ребенок."
  );

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "parent_link",
    entityId: linkId,
    action: "relationship.parent_child_deleted",
    beforeJson: before,
    afterJson: null
  });
}

export async function createPartnership(input: { treeId: string; personAId: string; personBId: string; status: string; startDate?: string | null; endDate?: string | null }) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);
  const data = await mutateAdminFirst<PartnershipRecord>(
    "person_partnerships",
    "POST",
    {
      tree_id: input.treeId,
      person_a_id: input.personAId,
      person_b_id: input.personBId,
      status: input.status,
      start_date: input.startDate || null,
      end_date: input.endDate || null
    },
    "Не удалось создать пару."
  );

  if (!data) throw new AppError(400, "Не удалось создать пару.");

  queueAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "partnership",
    entityId: data.id,
    action: "relationship.partnership_created",
    beforeJson: null,
    afterJson: data
  });

  return data;
}

export async function updatePartnership(partnershipId: string, input: Partial<{ status: string; startDate: string | null; endDate: string | null }>) {
  const before = await fetchAdminFirst<PartnershipRecord>(
    `person_partnerships?select=*&id=eq.${encodeURIComponent(partnershipId)}`,
    "Не удалось загрузить данные пары."
  );
  if (!before) throw new AppError(404, "Пара не найдена.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);

  const data = await mutateAdminFirst<PartnershipRecord>(
    `person_partnerships?id=eq.${encodeURIComponent(partnershipId)}`,
    "PATCH",
    {
      status: input.status ?? before.status,
      start_date: input.startDate === undefined ? before.start_date : input.startDate,
      end_date: input.endDate === undefined ? before.end_date : input.endDate
    },
    "Не удалось обновить данные пары."
  );

  if (!data) throw new AppError(400, "Не удалось обновить данные пары.");

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "partnership",
    entityId: partnershipId,
    action: "relationship.partnership_updated",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

export async function deletePartnership(partnershipId: string) {
  const before = await fetchAdminFirst<PartnershipRecord>(
    `person_partnerships?select=*&id=eq.${encodeURIComponent(partnershipId)}`,
    "Не удалось загрузить данные пары."
  );
  if (!before) throw new AppError(404, "Пара не найдена.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  await mutateAdminRows<never>(
    `person_partnerships?id=eq.${encodeURIComponent(partnershipId)}`,
    "DELETE",
    undefined,
    "Не удалось удалить пару."
  );

  queueAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "partnership",
    entityId: partnershipId,
    action: "relationship.partnership_deleted",
    beforeJson: before,
    afterJson: null
  });
}

export async function createInvite(input: { treeId: string; role: UserRole; inviteMethod: "link" | "email"; email?: string | null; expiresInDays: number }) {
  const { userId, membership } = await requireTreeRole(input.treeId, ["owner", "admin"]);

  if (membership.role === "admin" && input.role === "owner") {
    throw new AppError(403, "Администратор не может приглашать владельцев.");
  }

  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin()
    .from("tree_invites")
    .insert({
      tree_id: input.treeId,
      email: input.email || null,
      role: input.role,
      invite_method: input.inviteMethod,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: userId
    })
    .select("*")
    .single<InviteRecord>();

  if (error || !data) throw new AppError(400, error?.message || "Не удалось создать приглашение.");

  await insertAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "invite",
    entityId: data.id,
    action: "invite.created",
    beforeJson: null,
    afterJson: data
  });

  return {
    invite: data,
    token,
    url: `${getBaseUrl()}/auth/accept-invite?token=${token}`
  };
}

export async function acceptInvite(token: string) {
  const userId = await getAuthenticatedUserId();
  const tokenHash = hashInviteToken(token);

  const { data: invite, error: inviteError } = await admin().from("tree_invites").select("*").eq("token_hash", tokenHash).maybeSingle<InviteRecord>();
  if (inviteError || !invite) throw new AppError(404, "Приглашение не найдено.");
  if (invite.accepted_at) throw new AppError(409, "Это приглашение уже использовано.");
  if (new Date(invite.expires_at).getTime() < Date.now()) throw new AppError(410, "Срок действия приглашения истек.");

  const { data: existingMembership } = await admin().from("tree_memberships").select("*").eq("tree_id", invite.tree_id).eq("user_id", userId).maybeSingle<MembershipRecord>();

  if (existingMembership) {
    await admin().from("tree_memberships").update({ role: invite.role, status: "active" }).eq("id", existingMembership.id);
  } else {
    const { error: membershipError } = await admin().from("tree_memberships").insert({
      tree_id: invite.tree_id,
      user_id: userId,
      role: invite.role,
      status: "active"
    });

    if (membershipError) {
      throw new AppError(400, membershipError.message);
    }
  }

  const acceptedAt = new Date().toISOString();
  const { error: inviteUpdateError } = await admin().from("tree_invites").update({ accepted_at: acceptedAt }).eq("id", invite.id);
  if (inviteUpdateError) {
    throw new AppError(500, inviteUpdateError.message);
  }

  await insertAuditLog({
    treeId: invite.tree_id,
    actorUserId: userId,
    entityType: "invite",
    entityId: invite.id,
    action: "invite.accepted",
    beforeJson: invite,
    afterJson: { ...invite, accepted_at: acceptedAt }
  });

  const tree = await getTreeById(invite.tree_id);
  return tree;
}

export async function updateMembershipRole(membershipId: string, role: UserRole) {
  const { data: before, error: beforeError } = await admin().from("tree_memberships").select("*").eq("id", membershipId).single<MembershipRecord>();
  if (beforeError || !before) throw new AppError(404, "Участник не найден.");

  const { userId, membership } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  if (membership.role === "admin" && role === "owner") {
    throw new AppError(403, "Администратор не может назначить владельца.");
  }
  if (before.role === "owner") {
    throw new AppError(403, "В версии v1 роль владельца нельзя переназначить.");
  }

  const { data, error } = await admin().from("tree_memberships").update({ role }).eq("id", membershipId).select("*").single<MembershipRecord>();
  if (error || !data) throw new AppError(400, error?.message || "Не удалось изменить роль участника.");

  await insertAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "membership",
    entityId: membershipId,
    action: "membership.role_updated",
    beforeJson: before,
    afterJson: data
  });

  return data;
}

export async function revokeMembership(membershipId: string) {
  const { data: before, error: beforeError } = await admin().from("tree_memberships").select("*").eq("id", membershipId).single<MembershipRecord>();
  if (beforeError || !before) throw new AppError(404, "Участник не найден.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  if (before.role === "owner") {
    throw new AppError(403, "В версии v1 нельзя отозвать доступ владельца.");
  }

  const { error } = await admin().from("tree_memberships").update({ status: "revoked" }).eq("id", membershipId);
  if (error) throw new AppError(400, error.message);

  await insertAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "membership",
    entityId: membershipId,
    action: "membership.revoked",
    beforeJson: before,
    afterJson: { ...before, status: "revoked" }
  });
}

export async function createPhotoUploadTarget(input: {
  treeId: string;
  personId: string;
  filename: string;
  mimeType: string;
  visibility: "public" | "members";
  title: string;
  caption?: string | null;
}) {
  await requireTreeRole(input.treeId, ["owner", "admin"]);
  const mediaId = crypto.randomUUID();
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  const storagePath = `trees/${input.treeId}/photos/${mediaId}/${safeName}`;

  const { data, error } = await admin().storage.from(getStorageBucket()).createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data) {
    throw new AppError(400, error?.message || "Не удалось создать ссылку для загрузки.");
  }

  return {
    mediaId,
    path: storagePath,
    signedUrl: data.signedUrl,
    token: data.token
  };
}

export async function completePhotoUpload(input: {
  treeId: string;
  personId: string;
  mediaId: string;
  storagePath: string;
  title: string;
  caption?: string | null;
  visibility: "public" | "members";
  mimeType: string;
  sizeBytes?: number | null;
}) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);

  const { data, error } = await admin()
    .from("media_assets")
    .insert({
      id: input.mediaId,
      tree_id: input.treeId,
      kind: "photo",
      provider: "supabase_storage",
      visibility: input.visibility,
      storage_path: input.storagePath,
      title: input.title,
      caption: input.caption || null,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes || null,
      created_by: userId
    })
    .select("*")
    .single<MediaAssetRecord>();

  if (error || !data) throw new AppError(400, error?.message || "Не удалось завершить загрузку фото.");

  const { error: relationError } = await admin().from("person_media").insert({
    person_id: input.personId,
    media_id: input.mediaId,
    is_primary: false
  });

  if (relationError) {
    throw new AppError(400, relationError.message);
  }

  await insertAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "media",
    entityId: input.mediaId,
    action: "photo.created",
    beforeJson: null,
    afterJson: data
  });

  return data;
}

export async function createVideo(input: { treeId: string; personId: string; title: string; caption?: string | null; externalUrl: string }) {
  const { userId } = await requireTreeRole(input.treeId, ["owner", "admin"]);
  const tree = await getTreeById(input.treeId);
  if (tree.visibility !== "public") {
    throw new AppError(400, "Ссылки на видео Яндекс Диска доступны только для открытых деревьев в v1.");
  }

  const { data, error } = await admin()
    .from("media_assets")
    .insert({
      tree_id: input.treeId,
      kind: "video",
      provider: "yandex_disk",
      visibility: "public",
      external_url: input.externalUrl,
      title: input.title,
      caption: input.caption || null,
      created_by: userId
    })
    .select("*")
    .single<MediaAssetRecord>();

  if (error || !data) throw new AppError(400, error?.message || "Не удалось сохранить ссылку на видео.");

  const { error: relationError } = await admin().from("person_media").insert({
    person_id: input.personId,
    media_id: data.id,
    is_primary: false
  });

  if (relationError) throw new AppError(400, relationError.message);

  await insertAuditLog({
    treeId: input.treeId,
    actorUserId: userId,
    entityType: "media",
    entityId: data.id,
    action: "video.created",
    beforeJson: null,
    afterJson: data
  });

  return data;
}

export async function resolveMediaAccess(mediaId: string) {
  const { data: media, error } = await admin().from("media_assets").select("*").eq("id", mediaId).single<MediaAssetRecord>();
  if (error || !media) throw new AppError(404, "Медиа не найдено.");

  const tree = await getTreeById(media.tree_id);
  const user = await getCurrentUser();
  const membership = user ? await getMembership(tree.id, user.id) : null;

  if (!canViewTree(tree.visibility, membership)) {
    throw new AppError(403, "Дерево закрыто.");
  }

  if (!canSeeMedia(membership?.role ?? null, media.visibility)) {
    throw new AppError(403, "У вас нет доступа к этому медиафайлу.");
  }

  if (media.kind === "video") {
    return { kind: "video" as const, url: media.external_url || "" };
  }

  if (!media.storage_path) {
    throw new AppError(404, "Файл фотографии отсутствует.");
  }

  const { data: signed, error: signedError } = await admin().storage.from(getStorageBucket()).createSignedUrl(media.storage_path, 60);
  if (signedError || !signed) throw new AppError(400, signedError?.message || "Не удалось создать подписанную ссылку.");

  return { kind: "photo" as const, url: signed.signedUrl };
}

export async function deleteMedia(mediaId: string) {
  const { data: before, error: beforeError } = await admin().from("media_assets").select("*").eq("id", mediaId).single<MediaAssetRecord>();
  if (beforeError || !before) throw new AppError(404, "Медиа не найдено.");

  const { userId } = await requireTreeRole(before.tree_id, ["owner", "admin"]);
  if (before.kind === "photo" && before.storage_path) {
    await admin().storage.from(getStorageBucket()).remove([before.storage_path]);
  }

  const { error } = await admin().from("media_assets").delete().eq("id", mediaId);
  if (error) throw new AppError(400, error.message);

  await insertAuditLog({
    treeId: before.tree_id,
    actorUserId: userId,
    entityType: "media",
    entityId: mediaId,
    action: before.kind === "photo" ? "photo.deleted" : "video.deleted",
    beforeJson: before,
    afterJson: null
  });
}

export async function getDashboardBootstrap() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError(401, "Требуется авторизация.");
  }

  const trees = await listUserTrees(user.id);
  return { user, trees };
}

