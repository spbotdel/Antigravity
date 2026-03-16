"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page-shell narrow-shell">
      <Card className="auth-card">
        <div className="auth-card-copy">
          <p className="eyebrow">Неожиданная ошибка</p>
          <h1>Что-то пошло не так</h1>
        </div>
        <p className="form-error">{error.message}</p>
        <Button onClick={() => reset()}>
          Повторить
        </Button>
      </Card>
    </main>
  );
}
