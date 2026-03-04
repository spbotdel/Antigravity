import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell landing-page">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">Семейное дерево</p>
          <h1 className="landing-title">Соберите семейную память в одном спокойном дереве.</h1>
          <p className="landing-lead">
            Родственники, истории и фотографии остаются рядом со схемой семьи. Владелец управляет доступом, а участники видят только то, что им открыто.
          </p>
          <div className="hero-actions landing-actions">
            <Link href="/auth/register" className="primary-button">
              Создать дерево
            </Link>
            <Link href="/auth/login" className="ghost-button">
              Войти
            </Link>
          </div>
          <div className="landing-hero-points">
            <article className="landing-hero-point">
              <span>Схема</span>
              <strong>Дерево остается главным объектом экрана.</strong>
            </article>
            <article className="landing-hero-point">
              <span>Доступ</span>
              <strong>Публичная ссылка или приглашения без сложной настройки.</strong>
            </article>
            <article className="landing-hero-point">
              <span>Материалы</span>
              <strong>Фото и истории остаются рядом с людьми, а не в отдельной админке.</strong>
            </article>
          </div>
        </div>

        <section className="surface-card landing-workspace-card">
          <div className="landing-workspace-header">
            <p className="card-kicker">Рабочее пространство</p>
            <div className="landing-workspace-pills">
              <span className="meta-pill">Viewer и builder</span>
              <span className="meta-pill meta-pill-muted">Участники и роли</span>
            </div>
          </div>
          <div className="landing-workspace-copy">
            <h2>Первый экран показывает, как работает продукт, без маркетингового шума.</h2>
            <p>Открыть дерево, перейти в конструктор и проверить доступ можно из одного спокойного контура.</p>
          </div>
          <div className="landing-workspace-list">
            <article className="landing-workspace-row">
              <span>Просмотр</span>
              <strong>Сначала видно структуру семьи и материалы, а не длинный набор блоков.</strong>
            </article>
            <article className="landing-workspace-row">
              <span>Редактирование</span>
              <strong>Конструктор читается как рабочий режим, а не как отдельный продукт.</strong>
            </article>
            <article className="landing-workspace-row">
              <span>Контроль</span>
              <strong>Роли, приглашения и видимость подключаются только там, где они нужны.</strong>
            </article>
          </div>
          <div className="landing-workspace-footer">
            <span>Одно дерево для семьи</span>
            <strong>Переходы короткие, действия ясные, сама схема не теряется.</strong>
          </div>
        </section>
      </section>

      <section className="landing-detail-grid">
        <article className="surface-card">
          <p className="card-kicker">Права и роли</p>
          <h3>Владелец, администратор и участник читаются как реальные роли, а не как набор технических флажков.</h3>
          <p>Редактирование, просмотр и управление доступом уже разведены по сценариям, поэтому дерево не нужно сопровождать отдельными инструкциями.</p>
        </article>
        <article className="surface-card">
          <p className="card-kicker">Фото и истории</p>
          <h3>Семейные материалы остаются рядом с людьми и ветками дерева, а не теряются в отдельном архиве.</h3>
          <p>Публичные фотографии можно открыть по ссылке, личные оставить только участникам, а сам интерфейс не заставляет искать их по разным экранам.</p>
        </article>
      </section>

      <section className="surface-card landing-summary-card">
        <div className="landing-summary-copy">
          <p className="card-kicker">Для чего это подходит</p>
          <h2>Когда нужно собрать семейную структуру, сохранить материалы и спокойно дать доступ близким.</h2>
        </div>
        <div className="landing-summary-grid">
          <div>
            <span>Для семьи</span>
            <p>Один адрес дерева, понятный просмотр и приглашения без лишних шагов.</p>
          </div>
          <div>
            <span>Для владельца</span>
            <p>Редактирование, настройки и журнал остаются под рукой, но не перегружают первый экран.</p>
          </div>
          <div>
            <span>Для участников</span>
            <p>Открывается ровно тот объем информации, который действительно нужен для просмотра и совместной памяти.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
