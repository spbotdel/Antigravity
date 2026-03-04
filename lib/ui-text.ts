import type { InviteMethod, MediaKind, MediaVisibility, MembershipStatus, TreeVisibility, UserRole } from "@/lib/types";

const roleLabels: Record<UserRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  viewer: "Участник"
};

const treeVisibilityLabels: Record<TreeVisibility, string> = {
  public: "Открытое",
  private: "Закрытое"
};

const mediaVisibilityLabels: Record<MediaVisibility, string> = {
  public: "Публично",
  members: "Только участникам"
};

const mediaKindLabels: Record<MediaKind, string> = {
  photo: "Фото",
  video: "Видео"
};

const inviteMethodLabels: Record<InviteMethod, string> = {
  link: "Ссылка",
  email: "Email"
};

const membershipStatusLabels: Record<MembershipStatus, string> = {
  active: "Активен",
  revoked: "Отозван"
};

const auditActionLabels: Record<string, string> = {
  "tree.created": "Создано дерево",
  "tree.updated": "Обновлены данные дерева",
  "tree.visibility_changed": "Изменена видимость дерева",
  "person.created": "Добавлен человек",
  "person.updated": "Обновлены данные человека",
  "person.deleted": "Удален человек",
  "relationship.parent_child_created": "Добавлена связь родитель-ребенок",
  "relationship.parent_child_deleted": "Удалена связь родитель-ребенок",
  "relationship.partnership_created": "Добавлена пара",
  "relationship.partnership_updated": "Обновлены данные пары",
  "relationship.partnership_deleted": "Удалена пара",
  "invite.created": "Создано приглашение",
  "invite.accepted": "Приглашение принято",
  "membership.role_updated": "Изменена роль участника",
  "membership.revoked": "Доступ участника отозван",
  "photo.created": "Добавлено фото",
  "photo.deleted": "Удалено фото",
  "video.created": "Добавлено видео",
  "video.deleted": "Удалено видео"
};

const auditEntityLabels: Record<string, string> = {
  tree: "Дерево",
  person: "Человек",
  parent_link: "Связь родитель-ребенок",
  partnership: "Пара",
  invite: "Приглашение",
  membership: "Участник",
  media: "Медиа"
};

const genderLabels: Record<string, string> = {
  female: "Женский",
  male: "Мужской",
  other: "Другой"
};

export function formatRole(role: UserRole | null | undefined) {
  if (!role) {
    return "Гость";
  }

  return roleLabels[role];
}

export function formatTreeVisibility(visibility: TreeVisibility) {
  return treeVisibilityLabels[visibility];
}

export function formatMediaVisibility(visibility: MediaVisibility) {
  return mediaVisibilityLabels[visibility];
}

export function formatMediaKind(kind: MediaKind) {
  return mediaKindLabels[kind];
}

export function formatInviteMethod(method: InviteMethod) {
  return inviteMethodLabels[method];
}

export function formatMembershipStatus(status: MembershipStatus) {
  return membershipStatusLabels[status];
}

export function formatAuditAction(action: string) {
  return auditActionLabels[action] || action;
}

export function formatAuditEntity(entityType: string) {
  return auditEntityLabels[entityType] || entityType;
}

export function formatGender(gender: string | null | undefined) {
  if (!gender) {
    return "Не указано";
  }

  const normalized = gender.trim().toLowerCase();
  return genderLabels[normalized] || gender;
}
