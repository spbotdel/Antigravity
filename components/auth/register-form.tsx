"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { translateAuthError } from "@/lib/auth-error";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="stack-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
          const form = new FormData(event.currentTarget);
          const email = String(form.get("email") || "");
          const password = String(form.get("password") || "");
          const displayName = String(form.get("displayName") || "");
          const treeTitle = String(form.get("treeTitle") || "");
          const slug = String(form.get("slug") || slugify(treeTitle));
          const description = String(form.get("description") || "");

          const supabase = createBrowserSupabaseClient();
          const { data, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
              data: {
                display_name: displayName
              }
            }
          });

          if (authError) {
            setLoading(false);
            setError(translateAuthError(authError.message));
            return;
          }

          if (data.session) {
            const response = await fetch("/api/trees", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: treeTitle, slug, description })
            });

            if (!response.ok) {
              const payload = await response.json();
              setLoading(false);
              setError(payload.error || "Не удалось создать дерево.");
              return;
            }

            const payload = await response.json();
            router.push(payload.tree?.slug ? `/tree/${payload.tree.slug}/builder` : "/dashboard");
            router.refresh();
            return;
          }

          setLoading(false);
          setMessage("Аккаунт создан. Подтвердите почту, затем войдите и создайте свое дерево из панели управления.");
        } catch (submitError) {
          setLoading(false);
          setError(translateAuthError(submitError instanceof Error ? submitError.message : "fetch failed"));
        }
      }}
    >
      <div className="field-grid field-grid-2">
        <label>
          Ваше имя
          <input name="displayName" required placeholder="Анна Петровна" />
        </label>
        <label>
          Почта
          <input name="email" type="email" required placeholder="owner@example.com" />
        </label>
      </div>
      <div className="field-grid field-grid-2">
        <label>
          Пароль
          <input name="password" type="password" required minLength={8} placeholder="Минимум 8 символов" />
        </label>
        <label>
          Адрес ссылки
          <input name="slug" placeholder="ivanov-family" />
        </label>
      </div>
      <label>
        Название семейного дерева
        <input name="treeTitle" required placeholder="Семейное дерево Ивановых" />
      </label>
      <label>
        Описание
        <textarea name="description" rows={4} placeholder="Частный архив семьи, историй, фотографий и памяти." />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "Создаю аккаунт..." : "Зарегистрировать владельца"}
      </button>
    </form>
  );
}
