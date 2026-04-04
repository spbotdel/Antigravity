import { Suspense } from "react";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="page-shell narrow-shell">
      <Card className="auth-card">
        <div className="auth-card-copy">
          <p className="eyebrow">Вход</p>
          <h1>Вернитесь в рабочее пространство семейного дерева</h1>
        </div>
        <Suspense fallback={<p className="muted-copy">Загружаю форму входа...</p>}>
          <LoginForm />
        </Suspense>
        <p className="muted-copy auth-card-support">
          Еще нет аккаунта? <Link href="/auth/register">Создать аккаунт владельца</Link>
        </p>
      </Card>
    </main>
  );
}
