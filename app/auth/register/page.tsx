import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <main className="page-shell narrow-shell">
      <section className="auth-card">
        <p className="eyebrow">Регистрация владельца</p>
        <h1>Запустите новое семейное дерево</h1>
        <RegisterForm />
      </section>
    </main>
  );
}
