"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function InviteAcceptanceCard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="auth-card">
      <p className="eyebrow">Приглашение</p>
      <h1>Принять приглашение в семейное дерево</h1>
      <p className="muted-copy">Чтобы активировать приглашение, нужно войти в аккаунт.</p>
      <button
        className="primary-button"
        disabled={loading || !token}
        onClick={async () => {
          setLoading(true);
          setError(null);
          const response = await fetch("/api/invites/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
          });

          const payload = await response.json();
          setLoading(false);
          if (!response.ok) {
            if (response.status === 401) {
              router.push(`/auth/login?next=/auth/accept-invite?token=${encodeURIComponent(token)}`);
              return;
            }
            setError(payload.error || "Не удалось принять приглашение.");
            return;
          }

          window.location.assign(`/tree/${payload.slug}`);
        }}
      >
        {loading ? "Подтверждаю..." : "Принять приглашение"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
