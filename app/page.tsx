import { FamilyTreeLandingScene } from "@/components/landing/family-tree-landing-scene";

export default function HomePage() {
  return (
    <main className="page-shell landing-page">
      <FamilyTreeLandingScene />

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
