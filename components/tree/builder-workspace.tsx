"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  FamilyTreeCanvas,
  type FamilyTreeCanvasAction
} from "@/components/tree/family-tree-canvas";
import { getStorageBucket } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { buildDisplayTree, collectPersonMedia } from "@/lib/tree/display";
import { formatMediaKind, formatMediaVisibility } from "@/lib/ui-text";
import { formatDate } from "@/lib/utils";
import type { PersonRecord, TreeSnapshot } from "@/lib/types";

interface BuilderWorkspaceProps {
  snapshot: TreeSnapshot;
}

type BuilderPanel = "person" | "relations" | "media";
type BuilderPersonMode = "create" | "edit";
type CreateContext =
  | { type: "standalone" }
  | { type: "parent"; anchorPersonId: string }
  | { type: "child"; anchorPersonId: string }
  | { type: "partner"; anchorPersonId: string };

const PERSON_GENDER_OPTIONS = [
  { value: "", label: "Не указывать" },
  { value: "female", label: "Женщина" },
  { value: "male", label: "Мужчина" },
  { value: "other", label: "Другое" }
] as const;

function formatParentLinkMeta(value?: string | null) {
  if (!value || value === "biological") {
    return "Родственная связь";
  }

  if (value === "adoptive") {
    return "Усыновление";
  }

  return value;
}

function formatPartnershipStatus(value?: string | null) {
  if (!value || value === "partner") {
    return "Пара";
  }

  if (value === "married") {
    return "В браке";
  }

  if (value === "divorced") {
    return "В разводе";
  }

  return value;
}

function getPersonListMeta(person: PersonRecord) {
  const parts = [formatDate(person.birth_date), person.birth_place].filter(Boolean);
  return parts.length ? parts.join(" • ") : "Данные пока не заполнены";
}

function getPersonLifeLabel(person: PersonRecord) {
  return person.death_date ? formatDate(person.death_date) || "Есть дата смерти" : "Жив(а)";
}

function getCreateContextHeading(context: CreateContext, anchorPerson: PersonRecord | null) {
  if (context.type === "standalone") {
    return {
      title: "Новый человек",
      description: "Создайте отдельный блок, а затем соединяйте его с семьей кнопками прямо на схеме.",
      submitLabel: "Добавить человека"
    };
  }

  if (context.type === "parent") {
    return {
      title: "Новый родитель",
      description: anchorPerson ? `После сохранения новый блок сразу станет родителем для ${anchorPerson.full_name}.` : "После сохранения новый блок сразу станет родителем выбранного человека.",
      submitLabel: "Добавить родителя"
    };
  }

  if (context.type === "child") {
    return {
      title: "Новый ребенок",
      description: anchorPerson ? `После сохранения новый блок сразу станет ребенком для ${anchorPerson.full_name}.` : "После сохранения новый блок сразу станет ребенком выбранного человека.",
      submitLabel: "Добавить ребенка"
    };
  }

  return {
    title: "Новый партнер",
    description: anchorPerson ? `После сохранения новый блок сразу станет партнером для ${anchorPerson.full_name}.` : "После сохранения новый блок сразу станет партнером выбранного человека.",
    submitLabel: "Добавить партнера"
  };
}

export function BuilderWorkspace({ snapshot }: BuilderWorkspaceProps) {
  const [currentSnapshot, setCurrentSnapshot] = useState(snapshot);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(snapshot.tree.root_person_id || snapshot.people[0]?.id || null);
  const [activePanel, setActivePanel] = useState<BuilderPanel>("person");
  const [personMode, setPersonMode] = useState<BuilderPersonMode>(snapshot.people.length ? "edit" : "create");
  const [createContext, setCreateContext] = useState<CreateContext>({ type: "standalone" });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayTree = useMemo(() => buildDisplayTree(currentSnapshot), [currentSnapshot]);
  const peopleById = useMemo(() => new Map(currentSnapshot.people.map((person) => [person.id, person])), [currentSnapshot.people]);
  const selectedPerson = selectedPersonId ? peopleById.get(selectedPersonId) || null : null;
  const rootPerson = currentSnapshot.tree.root_person_id ? peopleById.get(currentSnapshot.tree.root_person_id) || null : null;
  const selectedMedia = selectedPerson ? collectPersonMedia(currentSnapshot, selectedPerson.id) : [];
  const anchorPerson = createContext.type === "standalone" ? null : peopleById.get(createContext.anchorPersonId) || null;
  const createHeading = getCreateContextHeading(createContext, anchorPerson);
  const createModeActive = activePanel === "person" && personMode === "create";
  const selectedParentLinks = selectedPerson ? currentSnapshot.parentLinks.filter((link) => link.child_person_id === selectedPerson.id) : [];
  const selectedChildLinks = selectedPerson ? currentSnapshot.parentLinks.filter((link) => link.parent_person_id === selectedPerson.id) : [];
  const selectedPartnerships = selectedPerson
    ? currentSnapshot.partnerships.filter((partnership) => partnership.person_a_id === selectedPerson.id || partnership.person_b_id === selectedPerson.id)
    : [];
  const isSelectedRoot = Boolean(selectedPerson && currentSnapshot.tree.root_person_id === selectedPerson.id);
  const selectedPersonSummaryStats = selectedPerson
    ? [
        { label: "Родители", value: String(selectedParentLinks.length) },
        { label: "Дети", value: String(selectedChildLinks.length) },
        { label: "Пары", value: String(selectedPartnerships.length) },
        { label: "Медиа", value: String(selectedMedia.length) }
      ]
    : [];
  const inspectorTitle = createModeActive ? createHeading.title : selectedPerson ? selectedPerson.full_name : "Выберите человека";
  const inspectorDescription = createModeActive
    ? createContext.type === "standalone"
      ? "Заполните поля справа и сохраните новый блок."
      : "Заполните данные нового человека. После сохранения связь появится автоматически."
    : selectedPerson
      ? activePanel === "person"
        ? "Здесь редактируются и сохраняются данные выбранного человека."
        : activePanel === "relations"
          ? "Здесь показаны текущие связи выбранного человека."
          : "Фото и видео привязаны к выбранному человеку и собираются ниже списком."
      : "Сначала выберите человека на схеме или в списке слева.";
  const stageTitle = createModeActive ? "Основная схема семьи" : selectedPerson ? selectedPerson.full_name : "Основная схема семьи";
  const stageNote = createModeActive
    ? createContext.type === "standalone"
      ? "Создайте новый блок. Для существующих карточек используйте + в углу, чтобы добавить родственника через правую панель."
      : `${createHeading.description} Данные нового человека заполняются справа.`
    : selectedPerson
      ? "Выберите блок, чтобы он подсветился. Кнопка + открывает меню связей, корзина удаляет выбранного человека."
      : "Выберите карточку на схеме или добавьте первого человека, чтобы начать собирать структуру семьи.";

  useEffect(() => {
    if (selectedPersonId && peopleById.has(selectedPersonId)) {
      return;
    }

    const fallbackId = currentSnapshot.tree.root_person_id || currentSnapshot.people[0]?.id || null;
    setSelectedPersonId(fallbackId);
    setActivePanel("person");
    setPersonMode(fallbackId ? "edit" : "create");
    if (!fallbackId) {
      setCreateContext({ type: "standalone" });
    }
  }, [currentSnapshot.people, currentSnapshot.tree.root_person_id, peopleById, selectedPersonId]);

  useEffect(() => {
    setCurrentSnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => {
    if (createContext.type !== "standalone" && !peopleById.has(createContext.anchorPersonId)) {
      setCreateContext({ type: "standalone" });
    }
  }, [createContext, peopleById]);

  function focusPerson(personId: string) {
    setSelectedPersonId(personId);
    setActivePanel("person");
    setPersonMode("edit");
    setCreateContext({ type: "standalone" });
  }

  function startStandaloneCreate() {
    setActivePanel("person");
    setPersonMode("create");
    setCreateContext({ type: "standalone" });
  }

  function startRelatedCreate(type: Exclude<CreateContext["type"], "standalone">, anchorPersonId: string) {
    setSelectedPersonId(anchorPersonId);
    setActivePanel("person");
    setPersonMode("create");
    setCreateContext({ type, anchorPersonId });
  }

  async function createPersonWithContext(
    values: {
      fullName: string;
      gender?: string | null;
      birthDate?: string | null;
      deathDate?: string | null;
      birthPlace?: string | null;
      deathPlace?: string | null;
      bio?: string | null;
      isLiving?: boolean;
    },
    context: CreateContext
  ) {
    setStatus(null);
    setError(null);
    const created = await requestJson("/api/persons", "POST", {
      treeId: currentSnapshot.tree.id,
      fullName: values.fullName,
      gender: values.gender || null,
      birthDate: values.birthDate || null,
      deathDate: values.deathDate || null,
      birthPlace: values.birthPlace || null,
      deathPlace: values.deathPlace || null,
      bio: values.bio || null,
      isLiving: values.deathDate ? false : values.isLiving ?? true
    });

    if (!created?.person) {
      return null;
    }

    const newPerson = created.person;
    let createStatus = created.message || "Человек добавлен.";

    if (context.type === "child") {
      const relation = await requestJson("/api/relationships/parent-child", "POST", {
        treeId: currentSnapshot.tree.id,
        parentPersonId: context.anchorPersonId,
        childPersonId: newPerson.id,
        relationType: "biological"
      });
      createStatus = relation ? "Блок добавлен и привязан как ребенок." : "Блок добавлен, но связь с ребенком не создалась.";
    }

    if (context.type === "parent") {
      const relation = await requestJson("/api/relationships/parent-child", "POST", {
        treeId: currentSnapshot.tree.id,
        parentPersonId: newPerson.id,
        childPersonId: context.anchorPersonId,
        relationType: "biological"
      });
      createStatus = relation ? "Блок добавлен и привязан как родитель." : "Блок добавлен, но связь с родителем не создалась.";
    }

    if (context.type === "partner") {
      const relation = await requestJson("/api/partnerships", "POST", {
        treeId: currentSnapshot.tree.id,
        personAId: context.anchorPersonId,
        personBId: newPerson.id,
        status: "partner",
        startDate: null,
        endDate: null
      });
      createStatus = relation ? "Блок добавлен и привязан как партнер." : "Блок добавлен, но связь с партнером не создалась.";
    }

    if (currentSnapshot.people.length === 0) {
      const rootUpdate = await requestJson(`/api/trees/${currentSnapshot.tree.id}`, "PATCH", {
        title: currentSnapshot.tree.title,
        slug: currentSnapshot.tree.slug,
        description: currentSnapshot.tree.description || "",
        rootPersonId: newPerson.id
      });
      if (rootUpdate) {
        createStatus = "Первый блок добавлен и назначен корнем дерева.";
      }
    }

    return { newPerson, createStatus };
  }

  async function reloadSnapshot() {
    const response = await fetch(`/api/tree/${currentSnapshot.tree.slug}/snapshot`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) {
      setError((payload && payload.error) || "Не удалось обновить дерево после изменения.");
      return null;
    }

    setCurrentSnapshot(payload);
    return payload;
  }

  async function requestJson(url: string, method: string, body: unknown) {
    setError(null);
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "Запрос не выполнен.");
      return null;
    }

    return payload;
  }

  async function submitJson(url: string, method: string, body: unknown) {
    setStatus(null);
    const payload = await requestJson(url, method, body);
    if (!payload) {
      return null;
    }

    setStatus(payload.message || "Сохранено.");
    await reloadSnapshot();
    return payload;
  }

  async function setRootPerson(personId: string | null) {
    const payload = await submitJson(`/api/trees/${currentSnapshot.tree.id}`, "PATCH", {
      rootPersonId: personId
    });

    if (!payload) {
      return;
    }

    setStatus(personId ? "Корень дерева обновлен." : "Корень дерева снят.");
    if (personId) {
      setSelectedPersonId(personId);
    }
  }

  async function submitCreatePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const created = await createPersonWithContext(
      {
        fullName: String(form.get("fullName") || ""),
        gender: String(form.get("gender") || "") || null,
        birthDate: String(form.get("birthDate") || "") || null,
        deathDate: String(form.get("deathDate") || "") || null,
        birthPlace: String(form.get("birthPlace") || "") || null,
        deathPlace: String(form.get("deathPlace") || "") || null,
        bio: String(form.get("bio") || "") || null
      },
      createContext
    );

    if (!created) {
      return;
    }

    formElement.reset();
    setStatus(created.createStatus);
    const freshSnapshot = await reloadSnapshot();
    setActivePanel("person");
    setPersonMode("edit");
    setCreateContext({ type: "standalone" });
    if (freshSnapshot) {
      setSelectedPersonId(created.newPerson.id);
    }
  }

  async function handleDeletePerson(person: PersonRecord) {
    const confirmed = window.confirm(`Удалить блок «${person.full_name}» вместе с его связями?`);
    if (!confirmed) {
      return;
    }

    const fallbackPersonId = currentSnapshot.people.find((entry) => entry.id !== person.id)?.id || null;
    if (currentSnapshot.tree.root_person_id === person.id) {
      const rootUpdated = await requestJson(`/api/trees/${currentSnapshot.tree.id}`, "PATCH", {
        rootPersonId: fallbackPersonId
      });
      if (!rootUpdated && currentSnapshot.people.length > 1) {
        return;
      }
    }

    setSelectedPersonId(fallbackPersonId);
    setActivePanel("person");
    setPersonMode(fallbackPersonId ? "edit" : "create");
    setCreateContext({ type: "standalone" });
    await submitJson(`/api/persons/${person.id}`, "DELETE", {});
  }

  async function removeParentLink(relationId: string) {
    await submitJson(`/api/relationships/parent-child/${relationId}`, "DELETE", {});
  }

  async function removePartnership(relationId: string) {
    await submitJson(`/api/partnerships/${relationId}`, "DELETE", {});
  }

  function handleCanvasAction(personId: string, action: FamilyTreeCanvasAction) {
    if (action === "edit") {
      focusPerson(personId);
      return;
    }

    if (action === "add-parent") {
      startRelatedCreate("parent", personId);
      return;
    }

    if (action === "add-child") {
      startRelatedCreate("child", personId);
      return;
    }

    if (action === "add-partner") {
      startRelatedCreate("partner", personId);
      return;
    }

    const person = peopleById.get(personId);
    if (person) {
      void handleDeletePerson(person);
    }
  }

  return (
    <div className="builder-layout builder-layout-reworked">
      <aside className="surface-card builder-sidebar">
        <div className="sidebar-header builder-sidebar-header">
          <div className="builder-sidebar-copy">
            <p className="eyebrow">Люди</p>
            <h2>{currentSnapshot.people.length} родственников</h2>
            <p className="muted-copy">Список слева остается коротким. Основная работа идет на схеме и в карточке справа.</p>
          </div>
          <button
            type="button"
            className="ghost-button ghost-button-compact"
            onClick={startStandaloneCreate}
          >
            Новый
          </button>
        </div>
        {currentSnapshot.people.length ? (
          <div className="person-list">
            {currentSnapshot.people.map((person) => (
              <button
                type="button"
                key={person.id}
                className={person.id === selectedPersonId ? "person-list-item person-list-item-active" : "person-list-item"}
                onClick={() => focusPerson(person.id)}
              >
                <div className="person-list-item-top">
                  <strong>{person.full_name}</strong>
                  {currentSnapshot.tree.root_person_id === person.id ? <span className="person-list-badge">Корень</span> : null}
                </div>
                <span className="person-list-meta">{getPersonListMeta(person)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state builder-sidebar-empty">Добавьте первого человека, чтобы слева появился список родственников.</div>
        )}
      </aside>

      <main className="builder-main">
        <div className="surface-card viewer-stage builder-stage">
          <div className="stage-header builder-stage-header">
            <div className="stage-header-copy">
              <p className="stage-kicker">Схема дерева</p>
              <h2>{stageTitle}</h2>
              <p className="builder-stage-note">{stageNote}</p>
            </div>
            <div className="builder-stage-meta">
              <span className="workspace-meta-chip">{currentSnapshot.people.length} человек</span>
              <span className="workspace-meta-chip">
                {rootPerson ? `Корень: ${rootPerson.full_name}` : "Нужен корень"}
              </span>
            </div>
          </div>
          <FamilyTreeCanvas
            tree={displayTree}
            selectedPersonId={selectedPersonId}
            onSelectPerson={focusPerson}
            interactive
            onNodeAction={handleCanvasAction}
            onEmptyAction={startStandaloneCreate}
          />
        </div>
      </main>

      <aside className="surface-card builder-inspector">
        <div className="builder-inspector-header">
          <div className="builder-inspector-copy">
            <p className="eyebrow">{createModeActive ? "Новый блок" : "Карточка человека"}</p>
            <h2>{inspectorTitle}</h2>
            <p className="muted-copy">{inspectorDescription}</p>
          </div>
          <div className="builder-panel-tabs" role="tablist" aria-label="Панели конструктора">
            <button
              type="button"
              className={activePanel === "person" ? "builder-panel-tab builder-panel-tab-active" : "builder-panel-tab"}
              onClick={() => setActivePanel("person")}
            >
              Человек
            </button>
            <button
              type="button"
              className={activePanel === "relations" ? "builder-panel-tab builder-panel-tab-active" : "builder-panel-tab"}
              onClick={() => setActivePanel("relations")}
            >
              Связи
            </button>
            <button
              type="button"
              className={activePanel === "media" ? "builder-panel-tab builder-panel-tab-active" : "builder-panel-tab"}
              onClick={() => setActivePanel("media")}
            >
              Медиа
            </button>
          </div>
        </div>

        {createModeActive ? (
          <div className="builder-person-summary builder-person-summary-empty">
            <strong>{createHeading.title}</strong>
            <span>{createContext.type === "standalone" ? "Новый блок появится отдельно, а связи можно добавить позже." : "Новый блок сразу встанет в выбранную связь."}</span>
          </div>
        ) : selectedPerson ? (
          <div className="builder-person-summary">
            <div className="builder-person-summary-topline">
              <div className="builder-person-summary-main">
                <strong>{selectedPerson.full_name}</strong>
                <span>{selectedPerson.birth_place || "Место рождения не указано"}</span>
              </div>
              <div className="builder-person-summary-badges">
                <span className="meta-pill meta-pill-muted">{selectedPerson.death_date ? "Есть дата смерти" : "Жив(а)"}</span>
              </div>
            </div>
            <div className="builder-person-summary-meta">
              <span>{formatDate(selectedPerson.birth_date) || "Дата рождения не указана"}</span>
              <span>{getPersonLifeLabel(selectedPerson)}</span>
            </div>
            <div className="builder-person-summary-grid">
              {selectedPersonSummaryStats.map((item) => (
                <div key={item.label} className="builder-person-summary-stat">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="builder-person-summary-actions">
              {isSelectedRoot ? (
                <span className="meta-pill">Текущий корень</span>
              ) : (
                <button
                  type="button"
                  className="ghost-button ghost-button-compact"
                  onClick={() => {
                    void setRootPerson(selectedPerson.id);
                  }}
                >
                  Сделать корнем
                </button>
              )}
              <button
                type="button"
                className="ghost-button ghost-button-compact"
                onClick={() => setActivePanel("relations")}
              >
                Открыть связи
              </button>
            </div>
          </div>
        ) : (
          <div className="builder-person-summary builder-person-summary-empty">
            <strong>Выберите человека</strong>
            <span>После выбора справа откроются его данные, связи и медиа.</span>
          </div>
        )}

        {error ? <p className="form-error">{error}</p> : null}
        {status ? <p className="form-success">{status}</p> : null}

        {activePanel === "person" ? (
          <section className="builder-panel-stack">
            {personMode === "create" ? (
              <div className="builder-section-block">
                <div className="builder-section-heading">
                  <h3>{createHeading.title}</h3>
                  <p className="muted-copy">Заполните данные человека. После сохранения новый блок появится на схеме.</p>
                </div>
                {createContext.type !== "standalone" && anchorPerson ? (
                  <div className="builder-create-context-card">
                    <div className="builder-create-context-copy">
                      <strong>{anchorPerson.full_name}</strong>
                      <span>
                        {createContext.type === "parent"
                          ? "Новый блок будет добавлен как родитель."
                          : createContext.type === "child"
                            ? "Новый блок будет добавлен как ребенок."
                            : "Новый блок будет добавлен как партнер."}
                      </span>
                    </div>
                    <button type="button" className="ghost-button ghost-button-compact" onClick={startStandaloneCreate}>
                      Без связи
                    </button>
                  </div>
                ) : null}
                <form className="stack-form builder-form-grid" onSubmit={submitCreatePerson}>
                  <label className="builder-field-span">
                    Полное имя
                    <input name="fullName" required placeholder="Мария Иванова" />
                  </label>
                  <label>
                    Пол
                    <select name="gender" defaultValue="">
                      {PERSON_GENDER_OPTIONS.map((option) => (
                        <option key={option.value || "none"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Дата рождения
                    <input name="birthDate" type="date" />
                  </label>
                  <label>
                    Место рождения
                    <input name="birthPlace" placeholder="Москва" />
                  </label>
                  <label>
                    Дата смерти
                    <input name="deathDate" type="date" />
                  </label>
                  <label>
                    Место смерти
                    <input name="deathPlace" placeholder="Необязательно" />
                  </label>
                  <label className="builder-field-span">
                    История
                    <textarea name="bio" rows={3} placeholder="Короткая биография, заметки или семейные воспоминания..." />
                  </label>
                  <button className="primary-button builder-field-span" type="submit">
                    {createHeading.submitLabel}
                  </button>
                </form>
              </div>
            ) : selectedPerson ? (
              <div className="builder-section-block">
                <div className="builder-section-heading">
                  <h3>Данные человека</h3>
                  <p className="muted-copy">Изменения сохраняются по кнопке ниже.</p>
                </div>
                <form
                  className="stack-form builder-form-grid"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    await submitJson(`/api/persons/${selectedPerson.id}`, "PATCH", {
                      fullName: String(form.get("fullName") || "").trim(),
                      gender: String(form.get("gender") || "") || null,
                      birthDate: String(form.get("birthDate") || "") || null,
                      deathDate: String(form.get("deathDate") || "") || null,
                      birthPlace: String(form.get("birthPlace") || "") || null,
                      deathPlace: String(form.get("deathPlace") || "") || null,
                      bio: String(form.get("bio") || "") || null,
                      isLiving: !String(form.get("deathDate") || "")
                    });
                  }}
                >
                  <label className="builder-field-span">
                    Полное имя
                    <input name="fullName" defaultValue={selectedPerson.full_name} required />
                  </label>
                  <label>
                    Пол
                    <select name="gender" defaultValue={selectedPerson.gender || ""}>
                      {PERSON_GENDER_OPTIONS.map((option) => (
                        <option key={option.value || "none"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Дата рождения
                    <input name="birthDate" type="date" defaultValue={selectedPerson.birth_date || ""} />
                  </label>
                  <label>
                    Место рождения
                    <input name="birthPlace" defaultValue={selectedPerson.birth_place || ""} />
                  </label>
                  <label>
                    Дата смерти
                    <input name="deathDate" type="date" defaultValue={selectedPerson.death_date || ""} />
                  </label>
                  <label>
                    Место смерти
                    <input name="deathPlace" defaultValue={selectedPerson.death_place || ""} />
                  </label>
                  <label className="builder-field-span">
                    История
                    <textarea name="bio" rows={3} defaultValue={selectedPerson.bio || ""} />
                  </label>
                  <div className="card-actions builder-field-span builder-form-actions">
                    <button className="primary-button" type="submit">
                      Сохранить
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => {
                        void handleDeletePerson(selectedPerson);
                      }}
                    >
                      Удалить человека
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="empty-state">Выберите человека в списке или на схеме, чтобы отредактировать его данные.</div>
            )}
          </section>
        ) : null}

        {activePanel === "relations" ? (
          <section className="builder-panel-stack">
            {selectedPerson ? (
              <>
                <div className="builder-section-block">
                  <div className="builder-section-heading">
                    <h3>Текущие связи</h3>
                    <p className="muted-copy">Нужного родственника можно открыть отсюда. Новые связи добавляются через + на карточке дерева.</p>
                  </div>
                  <div className="builder-relation-board">
                    <div className="builder-relation-group">
                      <span className="builder-relation-group-title">Родители</span>
                      {selectedParentLinks.length ? (
                        selectedParentLinks.map((link) => {
                          const parent = peopleById.get(link.parent_person_id);
                          return (
                            <article key={link.id} className="builder-relation-card">
                              <div className="builder-relation-card-copy">
                                <strong>{parent?.full_name || "Неизвестный человек"}</strong>
                                <span>{formatParentLinkMeta(link.relation_type)}</span>
                              </div>
                              <div className="builder-relation-card-actions">
                                {parent ? (
                                  <button type="button" className="ghost-button ghost-button-compact" onClick={() => focusPerson(parent.id)}>
                                    Открыть
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="danger-button danger-button-compact"
                                  onClick={async () => {
                                    await submitJson(`/api/relationships/parent-child/${link.id}`, "DELETE", {});
                                  }}
                                >
                                  Удалить
                                </button>
                              </div>
                            </article>
                          );
                        })
                      ) : (
                        <div className="builder-relation-empty">Родители пока не добавлены.</div>
                      )}
                    </div>

                    <div className="builder-relation-group">
                      <span className="builder-relation-group-title">Дети</span>
                      {selectedChildLinks.length ? (
                        selectedChildLinks.map((link) => {
                          const child = peopleById.get(link.child_person_id);
                          return (
                            <article key={link.id} className="builder-relation-card">
                              <div className="builder-relation-card-copy">
                                <strong>{child?.full_name || "Неизвестный человек"}</strong>
                                <span>{formatParentLinkMeta(link.relation_type)}</span>
                              </div>
                              <div className="builder-relation-card-actions">
                                {child ? (
                                  <button type="button" className="ghost-button ghost-button-compact" onClick={() => focusPerson(child.id)}>
                                    Открыть
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="danger-button danger-button-compact"
                                  onClick={async () => {
                                    await submitJson(`/api/relationships/parent-child/${link.id}`, "DELETE", {});
                                  }}
                                >
                                  Удалить
                                </button>
                              </div>
                            </article>
                          );
                        })
                      ) : (
                        <div className="builder-relation-empty">Дети пока не добавлены.</div>
                      )}
                    </div>

                    <div className="builder-relation-group">
                      <span className="builder-relation-group-title">Пары</span>
                      {selectedPartnerships.length ? (
                        selectedPartnerships.map((partnership) => {
                          const partnerId = partnership.person_a_id === selectedPerson.id ? partnership.person_b_id : partnership.person_a_id;
                          const partner = peopleById.get(partnerId);

                          return (
                            <article key={partnership.id} className="builder-relation-card">
                              <div className="builder-relation-card-copy">
                                <strong>{partner?.full_name || "Неизвестный человек"}</strong>
                                <span>{formatPartnershipStatus(partnership.status)}</span>
                              </div>
                              <div className="builder-relation-card-actions">
                                {partner ? (
                                  <button type="button" className="ghost-button ghost-button-compact" onClick={() => focusPerson(partner.id)}>
                                    Открыть
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="danger-button danger-button-compact"
                                  onClick={async () => {
                                    await submitJson(`/api/partnerships/${partnership.id}`, "DELETE", {});
                                  }}
                                >
                                  Удалить
                                </button>
                              </div>
                            </article>
                          );
                        })
                      ) : (
                        <div className="builder-relation-empty">Пары пока не добавлены.</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">Сначала выберите человека на схеме, а потом добавляйте ему родителей, детей или пару.</div>
            )}
          </section>
        ) : null}

        {activePanel === "media" ? (
          <section className="builder-panel-stack">
            {selectedPerson ? (
              <>
                <div className="builder-section-heading">
                  <p className="eyebrow">Медиа</p>
                  <h3>{selectedPerson.full_name}</h3>
                  <p className="muted-copy">Материалы привязываются к выбранному человеку и сразу попадают в список ниже.</p>
                </div>

                <div className="builder-section-block">
                  <div className="builder-block-heading">
                    <strong>Фото</strong>
                    <p className="muted-copy">Загрузите изображение и сразу задайте видимость.</p>
                  </div>
                  <form
                    className="stack-form builder-form-grid"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const file = form.get("photo") as File | null;
                      if (!file || file.size === 0) {
                        setError("Сначала выберите файл фотографии.");
                        return;
                      }

                      const request = await submitJson("/api/media/photos/upload-url", "POST", {
                        treeId: currentSnapshot.tree.id,
                        personId: selectedPerson.id,
                        filename: file.name,
                        mimeType: file.type,
                        visibility: String(form.get("visibility") || "public"),
                        title: String(form.get("title") || ""),
                        caption: String(form.get("caption") || "")
                      });

                      if (!request) {
                        return;
                      }

                      const supabase = createBrowserSupabaseClient();
                      const upload = await supabase.storage.from(getStorageBucket()).uploadToSignedUrl(request.path, request.token, file, {
                        contentType: file.type
                      });

                      if (upload.error) {
                        setError(upload.error.message);
                        return;
                      }

                      await submitJson("/api/media/photos/complete", "POST", {
                        treeId: currentSnapshot.tree.id,
                        personId: selectedPerson.id,
                        mediaId: request.mediaId,
                        storagePath: request.path,
                        visibility: String(form.get("visibility") || "public"),
                        title: String(form.get("title") || ""),
                        caption: String(form.get("caption") || ""),
                        mimeType: file.type,
                        sizeBytes: file.size
                      });

                      event.currentTarget.reset();
                    }}
                  >
                    <label className="builder-field-span">
                      Фото
                      <input name="photo" type="file" accept="image/*" required />
                    </label>
                    <label>
                      Название
                      <input name="title" required placeholder="Свадебный портрет" />
                    </label>
                    <label>
                      Видимость
                      <select name="visibility" defaultValue="public">
                        <option value="public">Всем по ссылке</option>
                        <option value="members">Только участникам</option>
                      </select>
                    </label>
                    <label className="builder-field-span">
                      Подпись
                      <textarea name="caption" rows={3} placeholder="Необязательная подпись" />
                    </label>
                    <button className="primary-button builder-field-span" type="submit">
                      Загрузить фото
                    </button>
                  </form>
                </div>

                {currentSnapshot.tree.visibility === "public" ? (
                  <div className="builder-section-block">
                    <div className="builder-block-heading">
                      <strong>Видео</strong>
                      <p className="muted-copy">В v1 видео с Яндекс Диска доступны только для открытого дерева.</p>
                    </div>
                    <form
                      className="stack-form builder-form-grid"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        await submitJson("/api/media/videos", "POST", {
                          treeId: currentSnapshot.tree.id,
                          personId: selectedPerson.id,
                          title: String(form.get("title") || ""),
                          caption: String(form.get("caption") || ""),
                          externalUrl: String(form.get("externalUrl") || "")
                        });
                        event.currentTarget.reset();
                      }}
                    >
                      <label>
                        Название видео
                        <input name="title" placeholder="Архивное видео" />
                      </label>
                      <label>
                        Публичная ссылка Яндекс Диска
                        <input name="externalUrl" placeholder="https://disk.yandex..." />
                      </label>
                      <label className="builder-field-span">
                        Подпись
                        <textarea name="caption" rows={3} placeholder="Необязательная подпись" />
                      </label>
                      <button className="primary-button builder-field-span" type="submit">
                        Сохранить видео
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="empty-state">Видео с Яндекс Диска доступно только в открытом дереве. Переключите режим в настройках.</div>
                )}

                <div className="builder-media-grid">
                  {selectedMedia.length ? (
                    selectedMedia.map((asset) => (
                      <article key={asset.id} className="media-card builder-media-card">
                        {asset.kind === "photo" ? <img src={`/api/media/${asset.id}`} alt={asset.title} className="media-photo" /> : null}
                        <div className="media-meta">
                          <span>{formatMediaKind(asset.kind)}</span>
                          <span>{formatMediaVisibility(asset.visibility)}</span>
                        </div>
                        <h4>{asset.title}</h4>
                        <p>{asset.caption || "Подпись не добавлена."}</p>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={async () => {
                            await submitJson(`/api/media/${asset.id}`, "DELETE", {});
                          }}
                        >
                          Удалить медиа
                        </button>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">Для этого человека медиа пока не загружены.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">Сначала выберите человека, чтобы добавлять фото и видео именно в его карточку.</div>
            )}
          </section>
        ) : null}
      </aside>
    </div>
  );
}
