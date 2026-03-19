import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import type { AuditEntryView } from "@/lib/types";

interface AuditLogTableProps {
  entries: AuditEntryView[];
  total: number;
  page: number;
  pageSize: number;
  slug: string;
}

export function AuditLogTable({ entries, total, page, pageSize, slug }: AuditLogTableProps) {
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = entries.length ? (page - 1) * pageSize + 1 : 0;
  const pageEnd = entries.length ? pageStart + entries.length - 1 : 0;
  const toneSummary = [
    { key: "create", label: "Создания", count: entries.filter((entry) => entry.event_tone === "create").length },
    { key: "update", label: "Изменения", count: entries.filter((entry) => entry.event_tone === "update").length },
    { key: "delete", label: "Удаления", count: entries.filter((entry) => entry.event_tone === "delete").length },
    { key: "access", label: "Доступ", count: entries.filter((entry) => entry.event_tone === "access").length },
    { key: "system", label: "Система", count: entries.filter((entry) => entry.event_tone === "system").length }
  ].filter((item) => item.count > 0);

  if (!entries.length) {
    return (
      <Card className="audit-card utility-section-card">
        <CardHeader className="audit-section-heading utility-section-heading">
          <p className="eyebrow">Журнал изменений</p>
          <h2 className="card-heading">Событий пока нет</h2>
          <p className="muted-copy">Когда в дереве появятся действия, здесь будет видна понятная история изменений по МСК.</p>
        </CardHeader>
        <CardContent>
          <div className="empty-state">В журнале пока нет событий.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="audit-layout utility-surface-layout">
      <section className="audit-summary-grid utility-summary-grid">
        <Card className="audit-summary-card utility-summary-card" size="sm">
          <CardContent className="flex flex-col gap-2">
            <span>Всего событий</span>
            <strong>{total}</strong>
            <p className="card-copy">Полный объем истории, а не только текущая страница.</p>
          </CardContent>
        </Card>
        <Card className="audit-summary-card utility-summary-card" size="sm">
          <CardContent className="flex flex-col gap-2">
            <span>Кто менял</span>
            <strong>{actors.size}</strong>
            <p className="card-copy">Уникальных участников или системных действий на текущей странице.</p>
          </CardContent>
        </Card>
        <Card className="audit-summary-card utility-summary-card" size="sm">
          <CardContent className="flex flex-col gap-2">
            <span>Последнее событие</span>
            <strong>{latestEntry ? formatter.format(new Date(latestEntry.created_at)) : "Нет данных"}</strong>
            <p className="card-copy">Время показано по МСК, UTC+3.</p>
          </CardContent>
        </Card>
        <Card className="audit-summary-card utility-summary-card" size="sm">
          <CardContent className="flex flex-col gap-2">
            <span>Последний автор</span>
            <strong>{latestActor}</strong>
            <p className="card-copy">Кто внес или запустил последнее изменение в ленте.</p>
          </CardContent>
        </Card>
      </section>

      <Card className="audit-card utility-section-card">
        <CardHeader className="audit-section-heading utility-section-heading">
          <p className="eyebrow">Журнал изменений</p>
          <h2 className="card-heading">Лента действий</h2>
          <p className="muted-copy">Создания, изменения, удаления и доступ собраны по времени без технических полей.</p>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="audit-tone-row">
            {toneSummary.map((item) => (
              <span key={item.key} className="audit-tone-chip">
                {item.label}: {item.count}
              </span>
            ))}
          </div>

          <div className="audit-tone-row">
            <span className="audit-tone-chip">
              Показано: {pageStart}-{pageEnd} из {total}
            </span>
            <span className="audit-tone-chip">
              Страница: {page} из {totalPages}
            </span>
          </div>

          <div className="audit-feed-list utility-entry-list">
            {entries.map((entry) => (
              <article key={entry.id} className="audit-entry-card utility-entry-card">
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
        </CardContent>

        {totalPages > 1 ? (
          <CardFooter className="action-row dashboard-card-actions">
            {page > 1 ? (
              <Link href={`/tree/${slug}/audit?page=${page - 1}`} className={buttonVariants({ variant: "secondary" })}>
                Назад
              </Link>
            ) : (
              <span className="members-static-note">Это первая страница</span>
            )}
            {page < totalPages ? (
              <Link href={`/tree/${slug}/audit?page=${page + 1}`} className={buttonVariants({ variant: "secondary" })}>
                Дальше
              </Link>
            ) : (
              <span className="members-static-note">Это последняя страница</span>
            )}
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}
