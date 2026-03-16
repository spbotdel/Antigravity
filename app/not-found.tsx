import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="page-shell narrow-shell">
      <Card className="auth-card">
        <div className="auth-card-copy">
          <p className="eyebrow">404</p>
          <h1>Страница не найдена</h1>
          <p className="muted-copy">Запрошенный маршрут или семейное дерево не существуют.</p>
        </div>
        <Link href="/" className={buttonVariants()}>
          На главную
        </Link>
      </Card>
    </main>
  );
}
