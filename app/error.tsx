"use client";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ru">
      <body>
        <main className="page-shell narrow-shell">
          <section className="auth-card">
            <p className="eyebrow">Неожиданная ошибка</p>
            <h1>Что-то пошло не так</h1>
            <p className="form-error">{error.message}</p>
            <button className="primary-button" onClick={() => reset()}>
              Повторить
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
