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
  video: "Видео",
  document: "Документ",
  audio: "Аудио"
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
  "invite.revoked": "Приглашение отозвано",
  "membership.role_updated": "Изменена роль участника",
  "membership.revoked": "Доступ участника отозван",
  "photo.created": "Добавлено фото",
  "photo.deleted": "Удалено фото",
  "video.created": "Добавлено видео",
  "video.deleted": "Удалено видео",
  "document.created": "Добавлен документ",
  "document.deleted": "Удален документ",
  "audio.created": "Добавлено аудио",
  "audio.deleted": "Удалено аудио",
  "share_link.created": "Создана семейная ссылка",
  "share_link.revoked": "Семейная ссылка отозвана"
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

export function formatPeopleCount(count: number) {
  const absCount = Math.abs(count);
  const mod100 = absCount % 100;
  const mod10 = absCount % 10;
  const noun = mod100 >= 11 && mod100 <= 14 ? "человек" : mod10 === 1 ? "человек" : mod10 >= 2 && mod10 <= 4 ? "человека" : "человек";
  return `${count} ${noun}`;
}

export function formatGenerationCount(count: number) {
  const absCount = Math.abs(count);
  const mod100 = absCount % 100;
  const mod10 = absCount % 10;
  const noun = mod100 >= 11 && mod100 <= 14 ? "поколений" : mod10 === 1 ? "поколение" : mod10 >= 2 && mod10 <= 4 ? "поколения" : "поколений";
  return `${count} ${noun}`;
}

export function formatTreeMeta(peopleCount: number, generationCount: number) {
  return `${formatPeopleCount(peopleCount)} • ${formatGenerationCount(generationCount)}`;
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
