"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CreateTreeFormProps {
  submitLabel?: string;
}

export function CreateTreeForm({ submitLabel = "Создать первое дерево" }: CreateTreeFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="stack-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/trees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: String(form.get("title") || ""),
            slug: String(form.get("slug") || ""),
            description: String(form.get("description") || "")
          })
        });

        const payload = await response.json();
        setLoading(false);

        if (!response.ok) {
          setError(payload.error || "Не удалось создать дерево.");
          return;
        }

        if (payload.tree?.slug) {
          router.push(`/tree/${payload.tree.slug}/builder`);
          router.refresh();
          return;
        }

        router.refresh();
      }}
    >
      <div className="field-grid field-grid-2">
        <label>
          Название дерева
          <input name="title" required placeholder="Семейное дерево Петровых" />
        </label>
        <label>
          Адрес ссылки
          <input name="slug" required placeholder="ivanov-family" />
        </label>
      </div>
      <label>
        Описание
        <textarea name="description" rows={4} placeholder="Короткое описание веток и периода семьи." />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "Создаю..." : submitLabel}
      </button>
    </form>
  );
}
