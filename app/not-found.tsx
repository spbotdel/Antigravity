import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-shell narrow-shell">
      <section className="auth-card">
        <p className="eyebrow">404</p>
        <h1>Страница не найдена</h1>
        <p className="muted-copy">Запрошенный маршрут или семейное дерево не существуют.</p>
        <Link href="/" className="primary-button">
          На главную
        </Link>
      </section>
    </main>
  );
}
