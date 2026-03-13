"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import type { PersonRecord, TreeRecord } from "@/lib/types";
import { formatTreeVisibility } from "@/lib/ui-text";
import { cn } from "@/lib/utils";

interface TreeSettingsFormProps {
  tree: TreeRecord;
  people: PersonRecord[];
  initialBaseUrl: string;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function buildTreeUrl(baseUrl: string, slug: string) {
  return `${normalizeBaseUrl(baseUrl)}/tree/${slug}`;
}

export function TreeSettingsForm({ tree, people, initialBaseUrl }: TreeSettingsFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentVisibility, setCurrentVisibility] = useState<TreeRecord["visibility"]>(tree.visibility);
  const [draftSlug, setDraftSlug] = useState(tree.slug);
  const [resolvedBaseUrl, setResolvedBaseUrl] = useState(() => normalizeBaseUrl(initialBaseUrl || "http://localhost:3000"));
  const [pendingAction, setPendingAction] = useState<"identity" | "public" | "private" | null>(null);
  const currentRootPerson = people.find((person) => person.id === tree.root_person_id) || null;
  const treeUrl = buildTreeUrl(resolvedBaseUrl, draftSlug || tree.slug);

  useEffect(() => {
    if (typeof window === "undefined" || !window.location?.origin) {
      return;
    }

    setResolvedBaseUrl(normalizeBaseUrl(window.location.origin));
  }, []);

  async function send(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "Не удалось сохранить настройки.");
      return null;
    }

    setError(null);
    setSuccess(payload.message || "Настройки сохранены.");
    router.refresh();
    return payload;
  }

  async function updateIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("identity");
    const form = new FormData(event.currentTarget);
    await send(`/api/trees/${tree.id}`, {
      title: String(form.get("title") || ""),
      slug: String(form.get("slug") || ""),
      description: String(form.get("description") || ""),
      rootPersonId: String(form.get("rootPersonId") || "") || null
    });
    setPendingAction(null);
  }

  async function updateVisibility(nextVisibility: TreeRecord["visibility"]) {
    if (nextVisibility === currentVisibility) {
      return;
    }

    setPendingAction(nextVisibility);
    const payload = await send(`/api/trees/${tree.id}/visibility`, { visibility: nextVisibility });
    if (payload?.tree?.visibility) {
      setCurrentVisibility(payload.tree.visibility);
    }
    setPendingAction(null);
  }

  async function copyTreeUrl() {
    try {
      await navigator.clipboard.writeText(treeUrl);
      setError(null);
      setSuccess("Ссылка на дерево скопирована.");
    } catch {
      setSuccess(null);
      setError("Не удалось скопировать ссылку автоматически. Скопируйте ее вручную.");
    }
  }

  return (
    <div className="settings-grid">
      <section className="surface-card settings-card settings-card-wide">
        <div className="settings-card-header">
          <div className="settings-card-header-copy">
            <p className="eyebrow">Данные дерева</p>
            <h2 className="settings-title">Название, адрес и структура</h2>
            <p className="muted-copy settings-lead">Задайте название, короткий адрес и человека, от которого начинается основная ветка схемы.</p>
          </div>
        </div>

        <div className="settings-meta-grid">
          <div className="settings-meta-card">
            <span>Ссылка на дерево</span>
            <strong>{treeUrl}</strong>
            <div className="card-actions settings-meta-actions">
              <button type="button" className="ghost-button ghost-button-compact" onClick={() => void copyTreeUrl()}>
                Скопировать ссылку
              </button>
            </div>
            <p>Этот адрес можно отправлять родственникам и участникам.</p>
          </div>
          <div className="settings-meta-card">
            <span>Корень дерева</span>
            <strong>{currentRootPerson?.full_name || "Пока не выбран"}</strong>
            <p>Если корень не выбран, схема собирается от первого доступного человека.</p>
          </div>
          <div className="settings-meta-card">
            <span>Людей в дереве</span>
            <strong>{people.length}</strong>
            <p>Количество карточек, доступных для выбора корня и дальнейшей сборки структуры.</p>
          </div>
        </div>

        <form className="stack-form settings-form" onSubmit={updateIdentity}>
          <div className="field-grid field-grid-2">
            <label>
              Название дерева
              <input name="title" defaultValue={tree.title} required />
              <small className="settings-field-note">Так дерево увидят участники и гости по ссылке.</small>
            </label>

            <label>
              Адрес страницы
              <input name="slug" defaultValue={tree.slug} required onChange={(event) => setDraftSlug(event.target.value)} />
              <small className="settings-field-note">Лучше оставить короткий и читаемый адрес, например `/tree/ivanovy`.</small>
            </label>
          </div>

          <label>
            Описание
            <textarea name="description" rows={4} defaultValue={tree.description || ""} />
            <small className="settings-field-note">Несколько строк о том, что это за дерево и кому оно посвящено.</small>
          </label>

          <div className="field-grid field-grid-2">
            <label>
              Корневой человек
              <select name="rootPersonId" defaultValue={tree.root_person_id || ""}>
                <option value="">Выбрать позже</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                  </option>
                ))}
              </select>
              <small className="settings-field-note">От него начинается основная ветка дерева в viewer и builder.</small>
            </label>
            <div className="settings-inline-note">
              <span className="settings-inline-note-label">Подсказка</span>
              <strong>Если структура семьи еще не готова, корень можно выбрать позже.</strong>
              <p>Сначала добавьте людей и связи, а потом закрепите того, с кого удобнее начинать просмотр дерева.</p>
            </div>
          </div>

          <div className="settings-actions-row">
            <button className="primary-button settings-save-button" type="submit" disabled={pendingAction === "identity"}>
              {pendingAction === "identity" ? "Сохраняю..." : "Сохранить данные"}
            </button>
          </div>
        </form>
      </section>

      <section className="surface-card settings-card settings-card-accent">
        <div className="settings-card-header settings-card-header-stack">
          <div className="settings-card-header-copy">
            <p className="eyebrow">Приватность</p>
            <h2 className="settings-title">Кто может открыть дерево</h2>
            <p className="muted-copy settings-lead">Изменение применяется сразу. Даже в открытом дереве медиа «только участникам» останутся скрытыми для гостей.</p>
          </div>

          <div className={cn("settings-visibility-badge", currentVisibility === "public" ? "settings-visibility-badge-public" : "settings-visibility-badge-private")}>
            Сейчас: {formatTreeVisibility(currentVisibility)}
          </div>
        </div>

        <div className="privacy-toggle">
          <button
            className={cn("privacy-option", currentVisibility === "private" && "privacy-option-active")}
            type="button"
            disabled={pendingAction === "private"}
            onClick={() => updateVisibility("private")}
          >
            <span className="privacy-option-label">Закрытое дерево</span>
            <strong className="privacy-option-title">Сделать закрытым</strong>
            <span className="privacy-option-copy">Доступ останется только у приглашенных и авторизованных участников.</span>
          </button>

          <button
            className={cn("privacy-option", currentVisibility === "public" && "privacy-option-active")}
            type="button"
            disabled={pendingAction === "public"}
            onClick={() => updateVisibility("public")}
          >
            <span className="privacy-option-label">Открытое дерево</span>
            <strong className="privacy-option-title">Сделать открытым</strong>
            <span className="privacy-option-copy">Любой человек со ссылкой сможет открыть дерево без приглашения.</span>
          </button>
        </div>

        <div className="settings-note-panel settings-note-panel-compact">
          <strong>Что важно</strong>
          <p>Фото, видео и документы теперь загружаются как файлы. Доступ к ним управляется общей настройкой видимости и ролями участников.</p>
        </div>
      </section>

      {(error || success) && (
        <div className="settings-feedback-strip">
          {error ? <p className="form-error">{error}</p> : null}
          {success ? <p className="form-success">{success}</p> : null}
        </div>
      )}
    </div>
  );
}
