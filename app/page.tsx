import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="page-shell landing-page">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">Частный семейный архив</p>
          <h1 className="landing-title">Одно дерево для семьи, доступа и общего архива.</h1>
          <p className="landing-lead">
            Дерево остается в центре. Владелец управляет доступом, помощники правят нужное, а родственники открывают спокойный read-only просмотр по ссылке.
          </p>
          <div className="hero-actions landing-actions">
            <Link href="/auth/register" className={buttonVariants({ size: "lg" })}>
              Создать дерево
            </Link>
            <Link href="/auth/login" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              Войти
            </Link>
          </div>
          <ul className="landing-hero-list">
            <li className="landing-hero-list-item">Дерево, просмотр и редактирование собраны в одном рабочем контуре.</li>
            <li className="landing-hero-list-item">Приглашения и семейные ссылки не смешиваются между собой.</li>
            <li className="landing-hero-list-item">Фото и видео остаются рядом с людьми и ветками, а не в отдельной админке.</li>
          </ul>
        </div>

        <Card className="landing-workspace-card">
          <div className="landing-workspace-header">
            <p className="card-kicker">Рабочее пространство</p>
            <div className="landing-workspace-pills">
              <Badge className="meta-pill">Viewer + Builder</Badge>
              <Badge className="meta-pill meta-pill-muted" variant="secondary">
                Архив и доступ
              </Badge>
            </div>
          </div>
          <div className="landing-workspace-copy">
            <h2 className="card-heading">Открыть дерево, перейти в конструктор и вернуться к архиву без лишних переходов.</h2>
            <p className="card-copy">Навигация держится вокруг одной семейной структуры, а не вокруг разрозненных экранов.</p>
          </div>
          <div className="landing-workspace-list">
            <article className="landing-workspace-row">
              <span>Просмотр</span>
              <strong>Сразу видно структуру семьи, выбранного человека и связанные материалы.</strong>
            </article>
            <article className="landing-workspace-row">
              <span>Редактирование</span>
              <strong>Конструктор держит действия рядом со схемой, а не уводит в отдельные формы.</strong>
            </article>
            <article className="landing-workspace-row">
              <span>Контроль</span>
              <strong>Роли, ссылки и видимость включаются только там, где это действительно нужно.</strong>
            </article>
          </div>
          <div className="landing-workspace-footer">
            <span>Один адрес для семьи</span>
            <strong>Открываете дерево по ссылке и остаетесь в одном рабочем ритме.</strong>
          </div>
        </Card>
      </section>

      <section className="landing-detail-grid">
        <Card className="p-6">
          <p className="card-kicker">Права и роли</p>
          <h3 className="card-heading">Владелец, помощник и участник работают в одном дереве без тяжелой админки.</h3>
          <p className="card-copy">Приглашения дают постоянный доступ по аккаунту, а семейные ссылки остаются отдельным read-only каналом.</p>
        </Card>
        <Card className="p-6">
          <p className="card-kicker">Материалы</p>
          <h3 className="card-heading">Фотографии, видео и документы собираются рядом с людьми и в общем архиве.</h3>
          <p className="card-copy">Публичный просмотр по ссылке и приватные материалы для участников не конфликтуют между собой.</p>
        </Card>
      </section>

      <Card className="landing-summary-card">
        <div className="landing-summary-copy">
          <p className="card-kicker">Кому подходит</p>
          <h2 className="card-heading">Когда семье нужен один спокойный инструмент для дерева, доступа и архива.</h2>
        </div>
        <div className="landing-summary-grid">
          <div>
            <span>Для семьи</span>
            <p className="card-copy">Один адрес дерева и понятный просмотр для родственников без лишней регистрации.</p>
          </div>
          <div>
            <span>Для владельца</span>
            <p className="card-copy">Конструктор, доступы, настройки и журнал собираются в один рабочий контур.</p>
          </div>
          <div>
            <span>Для участников</span>
            <p className="card-copy">Открывается только тот объем информации и действий, который разрешен владельцем.</p>
          </div>
        </div>
      </Card>
    </main>
  );
}
