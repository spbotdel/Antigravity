import Link from "next/link";

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
            <Link href="/auth/register" className="primary-button">
              Начать с дерева
            </Link>
            <Link href="/auth/login" className="ghost-button">
              Войти
            </Link>
          </div>
          <ul className="landing-hero-list">
            <li className="landing-hero-list-item">Схема семьи остается главным объектом экрана.</li>
            <li className="landing-hero-list-item">Права доступа не мешают работе с деревом.</li>
            <li className="landing-hero-list-item">Фото и истории привязаны к людям и веткам.</li>
          </ul>
        </div>

        <section className="surface-card landing-workspace-card">
          <div className="landing-workspace-header">
            <p className="card-kicker">Рабочее пространство</p>
            <div className="landing-workspace-pills">
              <span className="meta-pill">Viewer + Builder</span>
              <span className="meta-pill meta-pill-muted">Роли и доступ</span>
            </div>
          </div>
          <div className="landing-workspace-copy">
            <h2>Короткий контур: открыть дерево, перейти в конструктор, проверить доступ.</h2>
            <p>Интерфейс собран вокруг семьи и веток, а не вокруг длинных маркетинговых блоков.</p>
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
        </section>
      </section>

      <section className="landing-detail-grid">
        <article className="surface-card">
          <p className="card-kicker">Права и роли</p>
          <h3>Владелец, администратор и участник работают в одном дереве с разными правами.</h3>
          <p>Доступы разделены по реальным сценариям и не требуют отдельной настройки на каждом шаге.</p>
        </article>
        <article className="surface-card">
          <p className="card-kicker">Материалы</p>
          <h3>Фотографии и заметки остаются рядом с людьми, а не в отдельной админке.</h3>
          <p>Публичные материалы видны по ссылке, приватные остаются только для участников дерева.</p>
        </article>
      </section>

      <section className="surface-card landing-summary-card">
        <div className="landing-summary-copy">
          <p className="card-kicker">Кому подходит</p>
          <h2>Когда нужно вести живое семейное дерево и давать доступ близким без перегруженного интерфейса.</h2>
        </div>
        <div className="landing-summary-grid">
          <div>
            <span>Для семьи</span>
            <p>Один адрес дерева и понятный просмотр для родственников.</p>
          </div>
          <div>
            <span>Для владельца</span>
            <p>Конструктор, настройки и журнал доступны из одного рабочего контура.</p>
          </div>
          <div>
            <span>Для участников</span>
            <p>Открывается только тот объем информации, который разрешен владельцем.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
