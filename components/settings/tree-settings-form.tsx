"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { CopyIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
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

function buildCleanTreeUrl(baseUrl: string) {
  return `${normalizeBaseUrl(baseUrl)}/`;
}

function isCleanFamilyPath(pathname: string) {
  const normalizedPathname = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  return ["/", "/media", "/builder", "/settings", "/members", "/audit"].includes(normalizedPathname);
}

export function TreeSettingsForm({ tree, people, initialBaseUrl }: TreeSettingsFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentVisibility, setCurrentVisibility] = useState<TreeRecord["visibility"]>(tree.visibility);
  const [rootPersonId, setRootPersonId] = useState(tree.root_person_id || "");
  const [resolvedBaseUrl, setResolvedBaseUrl] = useState(() => normalizeBaseUrl(initialBaseUrl || "http://localhost:3000"));
  const [useCleanTreeUrl, setUseCleanTreeUrl] = useState(false);
  const [pendingAction, setPendingAction] = useState<"root" | "public" | "private" | null>(null);
  const currentRootPerson = people.find((person) => person.id === rootPersonId) || null;
  const treeUrl = useCleanTreeUrl ? buildCleanTreeUrl(resolvedBaseUrl) : buildTreeUrl(resolvedBaseUrl, tree.slug);

  useEffect(() => {
    if (typeof window === "undefined" || !window.location?.origin) {
      return;
    }

    setResolvedBaseUrl(normalizeBaseUrl(window.location.origin));
    setUseCleanTreeUrl(isCleanFamilyPath(window.location.pathname));
  }, []);

  useEffect(() => {
    setRootPersonId(tree.root_person_id || "");
    setCurrentVisibility(tree.visibility);
  }, [tree.root_person_id, tree.visibility]);

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

  async function updateRootPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("root");
    await send(`/api/trees/${tree.id}`, {
      rootPersonId: rootPersonId || null
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
    <div className="settings-grid utility-surface-layout">
      <Card className="settings-card settings-card-wide utility-section-card p-0">
        <CardHeader className="settings-card-header utility-section-heading px-6 pt-6 pb-0">
          <div className="settings-card-header-copy utility-section-heading-copy">
            <p className="eyebrow">Данные дерева</p>
            <h2 className="settings-title">Корень и структура</h2>
            <p className="muted-copy settings-lead">Выберите человека, от которого начинается основная ветка схемы.</p>
          </div>
        </CardHeader>

        <CardContent className="px-6 pt-0 pb-6">
          <div className="settings-meta-grid utility-summary-grid">
            <div className="settings-meta-card utility-summary-card">
              <span>Ссылка на дерево</span>
              <strong>{treeUrl}</strong>
              <div className="action-row settings-meta-actions">
                <Button type="button" variant="secondary" size="sm" onClick={() => void copyTreeUrl()}>
                  <CopyIcon />
                  Скопировать ссылку
                </Button>
              </div>
              <p>Этот адрес можно отправлять родственникам и участникам.</p>
            </div>
            <div className="settings-meta-card utility-summary-card">
              <span>Корень дерева</span>
              <strong>{currentRootPerson?.full_name || "Пока не выбран"}</strong>
              <p>Если корень не выбран, схема собирается от первого доступного человека.</p>
            </div>
            <div className="settings-meta-card utility-summary-card">
              <span>Людей в дереве</span>
              <strong>{people.length}</strong>
              <p>Количество карточек, доступных для выбора корня и дальнейшей сборки структуры.</p>
            </div>
          </div>

          <form className="stack-form settings-form" onSubmit={updateRootPerson}>
            <div className="form-grid form-grid-2">
              <label className="form-field">
                Корневой человек
                <SelectField name="rootPersonId" value={rootPersonId} onChange={(event) => setRootPersonId(event.target.value)}>
                  <option value="">Выбрать позже</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </SelectField>
                <small className="settings-field-note">От него начинается основная ветка дерева в viewer и builder.</small>
              </label>
              <div className="settings-inline-note utility-note-card">
                <span className="settings-inline-note-label">Подсказка</span>
                <strong>Если структура семьи еще не готова, корень можно выбрать позже.</strong>
                <p>Сначала добавьте людей и связи, а потом закрепите того, с кого удобнее начинать просмотр дерева.</p>
              </div>
            </div>

            <div className="settings-actions-row">
              <Button className="settings-save-button" type="submit" disabled={pendingAction === "root"}>
                {pendingAction === "root" ? "Сохраняю..." : "Сохранить данные"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="settings-card settings-card-accent utility-section-card p-0">
        <CardHeader className="settings-card-header settings-card-header-stack utility-section-heading px-6 pt-6 pb-0">
          <div className="settings-card-header-copy utility-section-heading-copy">
            <p className="eyebrow">Приватность</p>
            <h2 className="settings-title">Кто может открыть дерево</h2>
            <p className="muted-copy settings-lead">Изменение применяется сразу. Даже в открытом дереве медиа «только участникам» останутся скрытыми для гостей.</p>
          </div>

          <Badge
            className={cn("settings-visibility-badge", currentVisibility === "public" ? "settings-visibility-badge-public" : "settings-visibility-badge-private")}
            variant="secondary"
          >
            Сейчас: {formatTreeVisibility(currentVisibility)}
          </Badge>
        </CardHeader>

        <CardContent className="px-6 pt-0 pb-6">
          <div className="privacy-toggle">
            <Button
              className={cn(
                "privacy-option h-auto w-full justify-start whitespace-normal text-left",
                currentVisibility === "private" && "privacy-option-active"
              )}
              type="button"
              variant="outline"
              disabled={pendingAction === "private"}
              onClick={() => updateVisibility("private")}
            >
              <span className="privacy-option-label">Закрытое дерево</span>
              <strong className="privacy-option-title">Сделать закрытым</strong>
              <span className="privacy-option-copy">Доступ останется только у приглашенных и авторизованных участников.</span>
            </Button>

            <Button
              className={cn(
                "privacy-option h-auto w-full justify-start whitespace-normal text-left",
                currentVisibility === "public" && "privacy-option-active"
              )}
              type="button"
              variant="outline"
              disabled={pendingAction === "public"}
              onClick={() => updateVisibility("public")}
            >
              <span className="privacy-option-label">Открытое дерево</span>
              <strong className="privacy-option-title">Сделать открытым</strong>
              <span className="privacy-option-copy">Любой человек со ссылкой сможет открыть дерево без приглашения.</span>
            </Button>
          </div>

          <div className="settings-note-panel settings-note-panel-compact utility-note-card">
            <strong>Что важно</strong>
            <p>Фото, видео и документы теперь загружаются как файлы. Доступ к ним управляется общей настройкой видимости и ролями участников.</p>
          </div>
        </CardContent>
      </Card>

      {(error || success) && (
        <div className="settings-feedback-strip utility-feedback-strip">
          {error ? <p className="form-error">{error}</p> : null}
          {success ? <p className="form-success">{success}</p> : null}
        </div>
      )}
    </div>
  );
}
