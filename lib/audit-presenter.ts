import type { AuditEntry, AuditEntryView, MembershipStatus, UserRole } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import {
  formatGender,
  formatInviteMethod,
  formatMediaVisibility,
  formatMembershipStatus,
  formatRole,
  formatTreeVisibility
} from "@/lib/ui-text";

type JsonRecord = Record<string, unknown>;

interface AuditUserContext {
  name: string;
  email: string | null;
  role: UserRole | null;
  status: MembershipStatus | null;
}

interface AuditPresentationContext {
  usersById: Map<string, AuditUserContext>;
  personNamesById: Map<string, string>;
}

interface DiffField {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

const EMPTY_VALUE = "не указано";

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function getValue(record: JsonRecord | null, key: string): unknown {
  return record ? record[key] : undefined;
}

function getString(record: JsonRecord | null, key: string): string | null {
  const value = getValue(record, key);
  return typeof value === "string" && value.trim() ? value : null;
}

function getBoolean(record: JsonRecord | null, key: string): boolean | null {
  const value = getValue(record, key);
  return typeof value === "boolean" ? value : null;
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return value;
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(normalizeValue(left)) === JSON.stringify(normalizeValue(right));
}

function fallbackName(value: string | null, fallback = "объект") {
  return value || fallback;
}

function formatText(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return EMPTY_VALUE;
  }

  if (typeof value === "boolean") {
    return value ? "да" : "нет";
  }

  return String(value);
}

function formatLivingState(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return EMPTY_VALUE;
  }

  return value ? "жив(а)" : "умер(ла)";
}

function formatTreePerson(value: unknown, personNamesById: Map<string, string>) {
  if (typeof value !== "string" || !value) {
    return EMPTY_VALUE;
  }

  return personNamesById.get(value) || value;
}

function formatCalendarDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return EMPTY_VALUE;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDate(value);
  }

  return value;
}

function formatMoscowDateTime(value: unknown) {
  if (typeof value !== "string" || !value) {
    return EMPTY_VALUE;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatGenderValue(value: unknown) {
  return formatGender(typeof value === "string" ? value : null);
}

function formatUserName(user: AuditUserContext | null | undefined) {
  if (!user) {
    return "Неизвестный пользователь";
  }

  return user.name || user.email || "Неизвестный пользователь";
}

function formatActorLabel(user: AuditUserContext | null | undefined) {
  if (!user) {
    return "Система";
  }

  const name = formatUserName(user);
  if (user.role) {
    return `${formatRole(user.role)}: ${name}`;
  }

  return `Пользователь: ${name}`;
}

function buildDiffDetails(before: JsonRecord | null, after: JsonRecord | null, fields: DiffField[]) {
  const details: string[] = [];

  for (const field of fields) {
    const beforeValue = getValue(before, field.key);
    const afterValue = getValue(after, field.key);

    if (valuesEqual(beforeValue, afterValue)) {
      continue;
    }

    const formatter = field.format || formatText;
    details.push(`${field.label}: было ${formatter(beforeValue)}, стало ${formatter(afterValue)}.`);
  }

  return details;
}

function buildFilledDetails(record: JsonRecord | null, fields: DiffField[]) {
  const details: string[] = [];

  for (const field of fields) {
    const value = getValue(record, field.key);
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const formatter = field.format || formatText;
    details.push(`${field.label}: ${formatter(value)}.`);
  }

  return details;
}

function resolvePersonName(id: string | null, personNamesById: Map<string, string>) {
  if (!id) {
    return null;
  }

  return personNamesById.get(id) || null;
}

function describeParentChild(entry: AuditEntry, before: JsonRecord | null, after: JsonRecord | null, personNamesById: Map<string, string>) {
  const snapshot = after || before;
  const parentId = getString(snapshot, "parent_person_id");
  const childId = getString(snapshot, "child_person_id");
  const parentName = resolvePersonName(parentId, personNamesById) || "неизвестный родитель";
  const childName = resolvePersonName(childId, personNamesById) || "неизвестный ребенок";
  const relationType = getString(snapshot, "relation_type");

  const summary =
    entry.action === "relationship.parent_child_created"
      ? `Добавлена связь родитель-ребенок: ${parentName} -> ${childName}.`
      : `Удалена связь родитель-ребенок: ${parentName} -> ${childName}.`;

  const details = [
    `Родитель: ${parentName}.`,
    `Ребенок: ${childName}.`
  ];

  if (relationType) {
    details.push(`Тип связи: ${relationType}.`);
  }

  return { summary, details };
}

function describePartnership(entry: AuditEntry, before: JsonRecord | null, after: JsonRecord | null, personNamesById: Map<string, string>) {
  const snapshot = after || before;
  const personA = resolvePersonName(getString(snapshot, "person_a_id"), personNamesById) || "неизвестный человек";
  const personB = resolvePersonName(getString(snapshot, "person_b_id"), personNamesById) || "неизвестный человек";
  const pairName = `${personA} и ${personB}`;

  let summary = `Обновлены данные пары: ${pairName}.`;
  if (entry.action === "relationship.partnership_created") {
    summary = `Добавлена пара: ${pairName}.`;
  }
  if (entry.action === "relationship.partnership_deleted") {
    summary = `Удалена пара: ${pairName}.`;
  }

  const details =
    entry.action === "relationship.partnership_updated"
      ? buildDiffDetails(before, after, [
          { key: "status", label: "Статус" },
          { key: "start_date", label: "Дата начала", format: formatCalendarDate },
          { key: "end_date", label: "Дата окончания", format: formatCalendarDate }
        ])
      : buildFilledDetails(snapshot, [
          { key: "status", label: "Статус" },
          { key: "start_date", label: "Дата начала", format: formatCalendarDate },
          { key: "end_date", label: "Дата окончания", format: formatCalendarDate }
        ]);

  return {
    summary,
    details: [`Пара: ${pairName}.`, ...details]
  };
}

function describeMembership(entry: AuditEntry, before: JsonRecord | null, after: JsonRecord | null, usersById: Map<string, AuditUserContext>) {
  const snapshot = after || before;
  const targetUserId = getString(snapshot, "user_id");
  const targetUser = targetUserId ? usersById.get(targetUserId) : null;
  const targetName = formatUserName(targetUser);

  if (entry.action === "membership.revoked") {
    return {
      summary: `Отозван доступ участника: ${targetName}.`,
      details: [
        `Участник: ${targetName}.`,
        `Роль: ${formatRole((getValue(before, "role") as UserRole | null) || targetUser?.role || null)}.`,
        `Статус: ${formatMembershipStatus("active")}, затем ${formatMembershipStatus("revoked")}.`
      ]
    };
  }

  return {
    summary: `Изменена роль участника: ${targetName}.`,
    details: [
      `Участник: ${targetName}.`,
      ...buildDiffDetails(before, after, [{ key: "role", label: "Роль", format: (value) => formatRole((value as UserRole | null) || null) }])
    ]
  };
}

function describeInvite(entry: AuditEntry, before: JsonRecord | null, after: JsonRecord | null) {
  const snapshot = after || before;
  const role = (getValue(snapshot, "role") as UserRole | null) || null;
  const email = getString(snapshot, "email");

  if (entry.action === "invite.revoked") {
    return {
      summary: email ? `Отозвано приглашение для ${email}.` : `Отозвано приглашение на роль ${formatRole(role)}.`,
      details: [
        `Роль: ${formatRole(role)}.`,
        `Способ: ${formatInviteMethod((getValue(snapshot, "invite_method") as "link" | "email") || "link")}.`,
        email ? `Почта: ${email}.` : "Приглашение без привязки к почте.",
        `Первоначально действовало до: ${formatMoscowDateTime(getValue(snapshot, "expires_at"))}.`
      ]
    };
  }

  if (entry.action === "invite.accepted") {
    return {
      summary: "Приглашение принято.",
      details: [
        `Роль по приглашению: ${formatRole(role)}.`,
        email ? `Почта приглашения: ${email}.` : "Приглашение было создано без привязки к почте."
      ]
    };
  }

  return {
    summary: email ? `Создано приглашение для ${email}.` : `Создано приглашение на роль ${formatRole(role)}.`,
    details: [
      `Роль: ${formatRole(role)}.`,
      `Способ: ${formatInviteMethod((getValue(snapshot, "invite_method") as "link" | "email") || "link")}.`,
      email ? `Почта: ${email}.` : "Приглашение без привязки к почте.",
      `Действует до: ${formatMoscowDateTime(getValue(snapshot, "expires_at"))}.`
    ]
  };
}

function describeShareLink(entry: AuditEntry, before: JsonRecord | null, after: JsonRecord | null) {
  const snapshot = after || before;
  const label = getString(snapshot, "label") || "Семейный просмотр";

  if (entry.action === "share_link.revoked") {
    return {
      summary: `Отозвана семейная ссылка "${label}".`,
      details: [
        `Название: ${label}.`,
        `Действовала до: ${formatMoscowDateTime(getValue(before, "expires_at"))}.`,
        `Отозвана: ${formatMoscowDateTime(getValue(after, "revoked_at"))}.`
      ]
    };
  }

  return {
    summary: `Создана семейная ссылка "${label}".`,
    details: [
      `Название: ${label}.`,
      `Действует до: ${formatMoscowDateTime(getValue(snapshot, "expires_at"))}.`
    ]
  };
}

function describeMedia(entry: AuditEntry, before: JsonRecord | null, after: JsonRecord | null) {
  const snapshot = after || before;
  const title = fallbackName(getString(snapshot, "title"), "без названия");
  const kind = getString(snapshot, "kind");
  const noun = kind === "document" ? "документ" : kind === "video" ? "видео" : "фото";

  if (entry.action.endsWith(".deleted")) {
    return {
      summary: `Удалено ${noun}: "${title}".`,
      details: [
        `Название: ${title}.`,
        `Видимость: ${formatMediaVisibility((getValue(snapshot, "visibility") as "public" | "members") || "public")}.`
      ]
    };
  }

  return {
    summary: `Добавлено ${noun}: "${title}".`,
    details: buildFilledDetails(snapshot, [
      { key: "title", label: "Название" },
      { key: "visibility", label: "Видимость", format: (value) => formatMediaVisibility((value as "public" | "members") || "public") },
      { key: "caption", label: "Подпись" }
    ])
  };
}

function describeMediaAlbum(entry: AuditEntry, before: JsonRecord | null, after: JsonRecord | null) {
  const snapshot = after || before;
  const title = fallbackName(getString(snapshot, "title"), "без названия");
  const albumKind = getString(snapshot, "album_kind");
  const diffDetails = buildDiffDetails(before, after, [
    { key: "title", label: "Название" },
    { key: "description", label: "Описание" },
    {
      key: "album_kind",
      label: "Тип альбома",
      format: (value) => (value === "uploader" ? "Автоальбом загрузившего" : value ? "Пользовательский" : EMPTY_VALUE)
    }
  ]);

  if (entry.action === "media_album.created") {
    return {
      summary: `Создан альбом: "${title}".`,
      details: buildFilledDetails(snapshot, [
        { key: "title", label: "Название" },
        { key: "description", label: "Описание" },
        {
          key: "album_kind",
          label: "Тип альбома",
          format: (value) => (value === "uploader" ? "Автоальбом загрузившего" : "Пользовательский")
        }
      ])
    };
  }

  return {
    summary: `Обновлен альбом: "${title}".`,
    details: diffDetails.length
      ? diffDetails
      : [
          `Название: ${title}.`,
          albumKind === "uploader" ? "Тип альбома: Автоальбом загрузившего." : "Тип альбома: Пользовательский."
        ]
  };
}

function describeTree(entry: AuditEntry, before: JsonRecord | null, after: JsonRecord | null, personNamesById: Map<string, string>) {
  const snapshot = after || before;
  const title = fallbackName(getString(snapshot, "title"), "без названия");

  if (entry.action === "tree.created") {
    return {
      summary: `Создано семейное дерево "${title}".`,
      details: buildFilledDetails(snapshot, [
        { key: "slug", label: "Адрес ссылки", format: (value) => `/tree/${formatText(value)}` },
        { key: "visibility", label: "Режим доступа", format: (value) => formatTreeVisibility((value as "public" | "private") || "private") }
      ])
    };
  }

  if (entry.action === "tree.visibility_changed") {
    return {
      summary: `Изменен режим доступа дерева "${title}".`,
      details: buildDiffDetails(before, after, [
        { key: "visibility", label: "Режим доступа", format: (value) => formatTreeVisibility((value as "public" | "private") || "private") }
      ])
    };
  }

  return {
    summary: `Обновлены настройки дерева "${title}".`,
    details: buildDiffDetails(before, after, [
      { key: "title", label: "Название" },
      { key: "slug", label: "Адрес ссылки", format: (value) => `/tree/${formatText(value)}` },
      { key: "description", label: "Описание" },
      { key: "root_person_id", label: "Корневой человек", format: (value) => formatTreePerson(value, personNamesById) }
    ])
  };
}

function describePerson(entry: AuditEntry, before: JsonRecord | null, after: JsonRecord | null) {
  const snapshot = after || before;
  const personName = fallbackName(getString(snapshot, "full_name"), "без имени");

  if (entry.action === "person.created") {
    return {
      summary: `Добавлен человек: ${personName}.`,
      details: buildFilledDetails(snapshot, [
        { key: "gender", label: "Пол", format: formatGenderValue },
        { key: "birth_date", label: "Дата рождения", format: formatCalendarDate },
        { key: "death_date", label: "Дата смерти", format: formatCalendarDate },
        { key: "birth_place", label: "Место рождения" },
        { key: "death_place", label: "Место смерти" },
        { key: "is_living", label: "Статус", format: formatLivingState },
        { key: "bio", label: "Описание" }
      ])
    };
  }

  if (entry.action === "person.deleted") {
    return {
      summary: `Удален человек: ${personName}.`,
      details: buildFilledDetails(snapshot, [
        { key: "gender", label: "Пол", format: formatGenderValue },
        { key: "birth_date", label: "Дата рождения", format: formatCalendarDate },
        { key: "death_date", label: "Дата смерти", format: formatCalendarDate }
      ])
    };
  }

  return {
    summary: `Обновлены данные человека: ${personName}.`,
    details: buildDiffDetails(before, after, [
      { key: "full_name", label: "Имя" },
      { key: "gender", label: "Пол", format: formatGenderValue },
      { key: "birth_date", label: "Дата рождения", format: formatCalendarDate },
      { key: "death_date", label: "Дата смерти", format: formatCalendarDate },
      { key: "birth_place", label: "Место рождения" },
      { key: "death_place", label: "Место смерти" },
      { key: "is_living", label: "Статус", format: formatLivingState },
      { key: "bio", label: "Описание" }
    ])
  };
}

function buildPresentation(entry: AuditEntry, context: AuditPresentationContext) {
  const before = asRecord(entry.before_json);
  const after = asRecord(entry.after_json);

  if (entry.action.startsWith("tree.")) {
    return describeTree(entry, before, after, context.personNamesById);
  }

  if (entry.action.startsWith("person.")) {
    return describePerson(entry, before, after);
  }

  if (entry.action.startsWith("relationship.parent_child")) {
    return describeParentChild(entry, before, after, context.personNamesById);
  }

  if (entry.action.startsWith("relationship.partnership")) {
    return describePartnership(entry, before, after, context.personNamesById);
  }

  if (entry.action.startsWith("invite.")) {
    return describeInvite(entry, before, after);
  }

  if (entry.action.startsWith("share_link.")) {
    return describeShareLink(entry, before, after);
  }

  if (entry.action.startsWith("membership.")) {
    return describeMembership(entry, before, after, context.usersById);
  }

  if (entry.action.startsWith("photo.") || entry.action.startsWith("video.") || entry.action.startsWith("document.")) {
    return describeMedia(entry, before, after);
  }

  if (entry.action.startsWith("media_album.")) {
    return describeMediaAlbum(entry, before, after);
  }

  return {
    summary: "Зафиксировано изменение в системе.",
    details: ["Подробности для этого типа события пока не настроены."]
  };
}

export function buildAuditEntryViews(entries: AuditEntry[], context: AuditPresentationContext): AuditEntryView[] {
  return entries.map((entry) => {
    const actor = entry.actor_user_id ? context.usersById.get(entry.actor_user_id) : null;
    const presentation = buildPresentation(entry, context);
    const action = entry.action;

    let eventTone: AuditEntryView["event_tone"] = "system";
    let eventLabel = "Системное";

    if (action.includes(".created")) {
      eventTone = "create";
      eventLabel = "Создание";
    } else if (action.includes(".updated") || action.includes("visibility_changed") || action.includes("role_updated")) {
      eventTone = "update";
      eventLabel = "Изменение";
    } else if (action.includes(".deleted") || action.includes(".revoked")) {
      eventTone = "delete";
      eventLabel = "Удаление";
    } else if (action.includes("invite.accepted")) {
      eventTone = "access";
      eventLabel = "Доступ";
    }

    return {
      id: entry.id,
      created_at: entry.created_at,
      summary: presentation.summary,
      details: presentation.details.length ? presentation.details : ["Без дополнительных деталей."],
      actor_label: formatActorLabel(actor),
      event_tone: eventTone,
      event_label: eventLabel
    };
  });
}
