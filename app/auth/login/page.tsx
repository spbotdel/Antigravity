import { Suspense } from "react";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="page-shell narrow-shell">
      <section className="auth-card">
        <p className="eyebrow">Вход</p>
        <h1>Вернитесь в рабочее пространство семейного дерева</h1>
        <Suspense fallback={<p className="muted-copy">Загружаю форму входа...</p>}>
          <LoginForm />
        </Suspense>
        <p className="muted-copy">
          Еще нет аккаунта? <Link href="/auth/register">Создать аккаунт владельца</Link>
        </p>
      </section>
    </main>
  );
}
