import { RegisterForm } from "@/components/auth/register-form";
import { Card } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <main className="page-shell narrow-shell">
      <Card className="auth-card">
        <div className="auth-card-copy">
          <p className="eyebrow">Регистрация владельца</p>
          <h1>Запустите новое семейное дерево</h1>
        </div>
        <RegisterForm />
      </Card>
    </main>
  );
}
