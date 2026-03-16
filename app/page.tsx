import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="page-shell landing-page">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">Семейное дерево</p>
          <h1 className="landing-title">Соберите семейную историю в одном рабочем дереве.</h1>
          <p className="landing-lead">
            Родственники, связи и материалы остаются рядом со схемой. Владелец управляет доступом, участники открывают только нужный уровень данных.
          </p>
          <div className="hero-actions landing-actions">
            <Link href="/auth/register" className={buttonVariants({ size: "lg" })}>
              Начать с дерева
            </Link>
            <Link href="/auth/login" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              Войти
            </Link>
          </div>
          <ul className="landing-hero-list">
            <li className="landing-hero-list-item">Схема семьи остается главным объектом экрана.</li>
            <li className="landing-hero-list-item">Права доступа не мешают работе с деревом.</li>
            <li className="landing-hero-list-item">Фото и истории привязаны к людям и веткам.</li>
          </ul>
        </div>

        <Card className="landing-workspace-card">
          <div className="landing-workspace-header">
            <p className="card-kicker">Рабочее пространство</p>
            <div className="landing-workspace-pills">
              <Badge className="meta-pill">Viewer + Builder</Badge>
              <Badge className="meta-pill meta-pill-muted" variant="secondary">
                Роли и доступ
              </Badge>
            </div>
          </div>
          <div className="landing-workspace-copy">
            <h2 className="card-heading">Короткий контур: открыть дерево, перейти в конструктор, проверить доступ.</h2>
            <p className="card-copy">Интерфейс собран вокруг семьи и веток, а не вокруг длинных маркетинговых блоков.</p>
          </div>
          <div className="landing-workspace-list">
            <article className="landing-workspace-row">
              <span>Просмотр</span>
              <strong>Сразу видно структуру семьи и базовые материалы.</strong>
            </article>
            <article className="landing-workspace-row">
              <span>Редактирование</span>
              <strong>Конструктор ведет к действиям без лишних переходов.</strong>
            </article>
            <article className="landing-workspace-row">
              <span>Контроль</span>
              <strong>Роли и видимость включаются только в нужных местах.</strong>
            </article>
          </div>
          <div className="landing-workspace-footer">
            <span>Один адрес для семьи</span>
            <strong>Открываете дерево и продолжаете работу с того же экрана.</strong>
          </div>
        </Card>
      </section>

      <section className="landing-detail-grid">
        <Card className="p-6">
          <p className="card-kicker">Права и роли</p>
          <h3 className="card-heading">Владелец, администратор и участник работают в одном дереве с разными правами.</h3>
          <p className="card-copy">Доступы разделены по реальным сценариям и не требуют отдельной настройки на каждом шаге.</p>
        </Card>
        <Card className="p-6">
          <p className="card-kicker">Материалы</p>
          <h3 className="card-heading">Фотографии и заметки остаются рядом с людьми, а не в отдельной админке.</h3>
          <p className="card-copy">Публичные материалы видны по ссылке, приватные остаются только для участников дерева.</p>
        </Card>
      </section>

      <Card className="landing-summary-card">
        <div className="landing-summary-copy">
          <p className="card-kicker">Кому подходит</p>
          <h2 className="card-heading">Когда нужно вести живое семейное дерево и давать доступ близким без перегруженного интерфейса.</h2>
        </div>
        <div className="landing-summary-grid">
          <div>
            <span>Для семьи</span>
            <p className="card-copy">Один адрес дерева и понятный просмотр для родственников.</p>
          </div>
          <div>
            <span>Для владельца</span>
            <p className="card-copy">Конструктор, настройки и журнал доступны из одного рабочего контура.</p>
          </div>
          <div>
            <span>Для участников</span>
            <p className="card-copy">Открывается только тот объем информации, который разрешен владельцем.</p>
          </div>
        </div>
      </Card>
    </main>
  );
}
