import { describe, expect, it } from "vitest";

import { buildAuditEntryViews } from "@/lib/audit-presenter";
import type { AuditEntry } from "@/lib/types";

describe("audit presenter", () => {
  it("builds a human-readable person creation event", () => {
    const entries: AuditEntry[] = [
      {
        id: "audit-1",
        tree_id: "tree-1",
        actor_user_id: "user-1",
        entity_type: "person",
        entity_id: "person-1",
        action: "person.created",
        before_json: null,
        after_json: {
          id: "person-1",
          full_name: "Сергей Васильевич Иванов",
          gender: "male",
          birth_date: "1955-05-05",
          birth_place: "Москва",
          is_living: true
        },
        created_at: "2026-03-02T00:00:00.000Z"
      }
    ];

    const views = buildAuditEntryViews(entries, {
      usersById: new Map([
        [
          "user-1",
          {
            name: "Анна Петрова",
            email: "anna@example.com",
            role: "admin",
            status: "active"
          }
        ]
      ]),
      personNamesById: new Map()
    });

    expect(views[0]?.summary).toBe("Добавлен человек: Сергей Васильевич Иванов.");
    expect(views[0]?.actor_label).toBe("Администратор: Анна Петрова");
    expect(views[0]?.event_tone).toBe("create");
    expect(views[0]?.event_label).toBe("Создание");
    expect(views[0]?.details).toContain("Место рождения: Москва.");
  });

  it("shows concrete diffs for person updates", () => {
    const entries: AuditEntry[] = [
      {
        id: "audit-2",
        tree_id: "tree-1",
        actor_user_id: "user-2",
        entity_type: "person",
        entity_id: "person-2",
        action: "person.updated",
        before_json: {
          full_name: "Мария Иванова",
          birth_place: "Казань",
          is_living: true
        },
        after_json: {
          full_name: "Мария Петрова",
          birth_place: "Москва",
          is_living: false
        },
        created_at: "2026-03-02T01:00:00.000Z"
      }
    ];

    const views = buildAuditEntryViews(entries, {
      usersById: new Map([
        [
          "user-2",
          {
            name: "Иван Сергеев",
            email: "ivan@example.com",
            role: "owner",
            status: "active"
          }
        ]
      ]),
      personNamesById: new Map()
    });

    expect(views[0]?.summary).toBe("Обновлены данные человека: Мария Петрова.");
    expect(views[0]?.event_tone).toBe("update");
    expect(views[0]?.details).toContain("Имя: было Мария Иванова, стало Мария Петрова.");
    expect(views[0]?.details).toContain("Место рождения: было Казань, стало Москва.");
    expect(views[0]?.details).toContain("Статус: было жив(а), стало умер(ла).");
  });
});
