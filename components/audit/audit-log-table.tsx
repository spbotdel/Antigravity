import type { AuditEntryView } from "@/lib/types";

interface AuditLogTableProps {
  entries: AuditEntryView[];
}

export function AuditLogTable({ entries }: AuditLogTableProps) {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const actors = new Set(entries.map((entry) => entry.actor_label));
  const latestEntry = entries[0] ?? null;
  const latestActor = latestEntry?.actor_label || "Система";
  const toneSummary = [
    { key: "create", label: "Создания", count: entries.filter((entry) => entry.event_tone === "create").length },
    { key: "update", label: "Изменения", count: entries.filter((entry) => entry.event_tone === "update").length },
    { key: "delete", label: "Удаления", count: entries.filter((entry) => entry.event_tone === "delete").length },
    { key: "access", label: "Доступ", count: entries.filter((entry) => entry.event_tone === "access").length },
    { key: "system", label: "Система", count: entries.filter((entry) => entry.event_tone === "system").length }
  ].filter((item) => item.count > 0);

  if (!entries.length) {
    return (
      <div className="surface-card audit-card">
        <div className="audit-section-heading">
          <p className="eyebrow">Журнал изменений</p>
          <h2>Событий пока нет</h2>
          <p className="muted-copy">Когда в дереве появятся действия, здесь будет видна понятная история изменений по МСК.</p>
        </div>
        <div className="empty-state">В журнале пока нет событий.</div>
      </div>
    );
  }

  return (
    <div className="audit-layout">
      <section className="audit-summary-grid">
        <article className="surface-card audit-summary-card">
          <span>Всего событий</span>
          <strong>{entries.length}</strong>
          <p>Вся история действий по дереву.</p>
        </article>
        <article className="surface-card audit-summary-card">
          <span>Кто менял</span>
          <strong>{actors.size}</strong>
          <p>Уникальных участников или системных действий в ленте.</p>
        </article>
        <article className="surface-card audit-summary-card">
          <span>Последнее событие</span>
          <strong>{latestEntry ? formatter.format(new Date(latestEntry.created_at)) : "Нет данных"}</strong>
          <p>Время показано по МСК, UTC+3.</p>
        </article>
        <article className="surface-card audit-summary-card">
          <span>Последний автор</span>
          <strong>{latestActor}</strong>
          <p>Кто внес или запустил последнее изменение в ленте.</p>
        </article>
      </section>

      <section className="surface-card audit-card">
        <div className="audit-section-heading">
          <p className="eyebrow">Журнал изменений</p>
          <h2>Лента действий</h2>
          <p className="muted-copy">Создания, изменения, удаления и доступ собраны по времени без технических полей.</p>
        </div>

        <div className="audit-tone-row">
          {toneSummary.map((item) => (
            <span key={item.key} className="audit-tone-chip">
              {item.label}: {item.count}
            </span>
          ))}
        </div>

        <div className="audit-feed-list">
          {entries.map((entry) => (
            <article key={entry.id} className="audit-entry-card">
              <div className="audit-entry-topline">
                <div className="meta-row meta-row-tight">
                  <span className={`audit-event-pill audit-event-pill-${entry.event_tone}`}>{entry.event_label}</span>
                  <span className="audit-entry-time">{formatter.format(new Date(entry.created_at))}</span>
                </div>
                <span className="audit-entry-actor">{entry.actor_label}</span>
              </div>

              <div className="audit-entry-copy">
                <strong className="audit-summary">{entry.summary}</strong>
                <ul className="audit-details">
                  {entry.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
