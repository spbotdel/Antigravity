"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import {
  FamilyTreeCanvas,
  type FamilyTreeCanvasAction
} from "@/components/tree/family-tree-canvas";
import { getStorageBucket } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { buildBuilderDisplayTree, buildPersonPhotoPreviewUrls, collectPersonMedia } from "@/lib/tree/display";
import { formatMediaKind, formatMediaVisibility } from "@/lib/ui-text";
import { formatDate } from "@/lib/utils";
import type { ParentLinkRecord, PartnershipRecord, PersonRecord, TreeSnapshot } from "@/lib/types";

interface BuilderWorkspaceProps {
  snapshot: TreeSnapshot;
  mediaLoaded?: boolean;
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

function getAutoCreateName(type: Exclude<CreateContext["type"], "standalone">) {
  if (type === "parent") {
    return "Новый родитель";
  }

  if (type === "child") {
    return "Новый ребенок";
  }

  return "Новый партнер";
}

function sortPeopleRecords(people: PersonRecord[]) {
  return [...people].sort((left, right) => left.full_name.localeCompare(right.full_name, "ru") || left.id.localeCompare(right.id));
}

function compareNullableDate(left?: string | null, right?: string | null) {
  if (left && right) {
    return left.localeCompare(right);
  }

  if (left) {
    return -1;
  }

  if (right) {
    return 1;
  }

  return 0;
}

function getBuilderDefaultRootId(snapshot: TreeSnapshot) {
  if (snapshot.tree.root_person_id && snapshot.people.some((person) => person.id === snapshot.tree.root_person_id)) {
    return snapshot.tree.root_person_id;
  }

  const childIds = new Set(snapshot.parentLinks.map((link) => link.child_person_id));
  const rootCandidate = [...snapshot.people]
    .filter((person) => !childIds.has(person.id))
    .sort((left, right) => compareNullableDate(left.birth_date, right.birth_date) || left.full_name.localeCompare(right.full_name, "ru") || left.id.localeCompare(right.id))[0];

  return rootCandidate?.id || snapshot.people[0]?.id || null;
}

function isTemporaryPersonId(personId: string | null) {
  return Boolean(personId && personId.startsWith("temp-person-"));
}

function replaceSelectedPersonIfCurrent(
  setSelectedPersonId: Dispatch<SetStateAction<string | null>>,
  expectedPersonId: string | null,
  nextPersonId: string | null
) {
  setSelectedPersonId((currentPersonId) => (currentPersonId === expectedPersonId ? nextPersonId : currentPersonId));
}

function replacePersonIdInSnapshot(snapshot: TreeSnapshot, tempPersonId: string, nextPerson: PersonRecord) {
  if (tempPersonId === nextPerson.id) {
    return snapshot;
  }

  return {
    ...snapshot,
    tree:
      snapshot.tree.root_person_id === tempPersonId
        ? {
            ...snapshot.tree,
            root_person_id: nextPerson.id
          }
        : snapshot.tree,
    people: sortPeopleRecords(
      snapshot.people.map((person) => (person.id === tempPersonId ? nextPerson : person))
    ),
    parentLinks: snapshot.parentLinks.map((link) => ({
      ...link,
      parent_person_id: link.parent_person_id === tempPersonId ? nextPerson.id : link.parent_person_id,
      child_person_id: link.child_person_id === tempPersonId ? nextPerson.id : link.child_person_id
    })),
    partnerships: snapshot.partnerships.map((partnership) => ({
      ...partnership,
      person_a_id: partnership.person_a_id === tempPersonId ? nextPerson.id : partnership.person_a_id,
      person_b_id: partnership.person_b_id === tempPersonId ? nextPerson.id : partnership.person_b_id
    })),
    personMedia: snapshot.personMedia.map((item) => ({
      ...item,
      person_id: item.person_id === tempPersonId ? nextPerson.id : item.person_id
    }))
  };
}

export function BuilderWorkspace({ snapshot, mediaLoaded = true }: BuilderWorkspaceProps) {
  const [currentSnapshot, setCurrentSnapshot] = useState(snapshot);
  const [isMediaLoaded, setIsMediaLoaded] = useState(mediaLoaded);
  const [visualRootPersonId, setVisualRootPersonId] = useState<string | null>(getBuilderDefaultRootId(snapshot));
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(getBuilderDefaultRootId(snapshot));
  const [activePanel, setActivePanel] = useState<BuilderPanel>("person");
  const [personMode, setPersonMode] = useState<BuilderPersonMode>(snapshot.people.length ? "edit" : "create");
  const [createContext, setCreateContext] = useState<CreateContext>({ type: "standalone" });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentSnapshotRef = useRef(currentSnapshot);
  const tempPersonResolutionPromisesRef = useRef(new Map<string, Promise<string | null>>());
  const tempPersonResolutionResolversRef = useRef(new Map<string, (personId: string | null) => void>());
  const resolvedTempPersonIdsRef = useRef(new Map<string, string | null>());
  const peopleById = useMemo(() => new Map(currentSnapshot.people.map((person) => [person.id, person])), [currentSnapshot.people]);
  const effectiveSnapshot = useMemo(
    () => ({
      ...currentSnapshot,
      tree: {
        ...currentSnapshot.tree,
        root_person_id: visualRootPersonId
      }
    }),
    [currentSnapshot, visualRootPersonId]
  );
  const displayTree = useMemo(() => buildBuilderDisplayTree(effectiveSnapshot), [effectiveSnapshot]);
  const personPhotoPreviewUrls = useMemo(
    () => buildPersonPhotoPreviewUrls(currentSnapshot),
    [currentSnapshot.media, currentSnapshot.personMedia]
  );
  const selectedPerson = selectedPersonId ? peopleById.get(selectedPersonId) || null : null;
  const selectedPersonPending = Boolean(selectedPerson && isTemporaryPersonId(selectedPerson.id));
  const rootPerson = visualRootPersonId ? peopleById.get(visualRootPersonId) || null : null;
  const selectedMedia = selectedPerson ? collectPersonMedia(currentSnapshot, selectedPerson.id) : [];
  const anchorPerson = createContext.type === "standalone" ? null : peopleById.get(createContext.anchorPersonId) || null;
  const createHeading = getCreateContextHeading(createContext, anchorPerson);
  const createModeActive = activePanel === "person" && personMode === "create";
  const selectedParentLinks = selectedPerson ? currentSnapshot.parentLinks.filter((link) => link.child_person_id === selectedPerson.id) : [];
  const selectedChildLinks = selectedPerson ? currentSnapshot.parentLinks.filter((link) => link.parent_person_id === selectedPerson.id) : [];
  const selectedPartnerships = selectedPerson
    ? currentSnapshot.partnerships.filter((partnership) => partnership.person_a_id === selectedPerson.id || partnership.person_b_id === selectedPerson.id)
    : [];
  const isSelectedRoot = Boolean(selectedPerson && visualRootPersonId === selectedPerson.id);
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
    ? "Заполните поля справа и сохраните новый блок."
    : selectedPersonPending
      ? "Блок создается. Как только сервер подтвердит запись, справа откроется обычное редактирование."
      : selectedPerson
      ? activePanel === "person"
        ? "Здесь редактируются и сохраняются данные выбранного человека."
        : activePanel === "relations"
          ? "Здесь показаны текущие связи выбранного человека."
          : "Фото и видео привязаны к выбранному человеку и собираются ниже списком."
      : "Сначала выберите человека на схеме или в списке слева.";
  const stageTitle = createModeActive ? "Основная схема семьи" : selectedPerson ? selectedPerson.full_name : "Основная схема семьи";
  const stageNote = createModeActive
    ? "Создайте новый отдельный блок. Для существующих карточек используйте +, чтобы сразу добавлять родственников в схему."
    : selectedPerson
      ? "Выберите блок, чтобы он подсветился. Кнопка + открывает меню связей, корзина удаляет выбранного человека."
      : "Выберите карточку на схеме или добавьте первого человека, чтобы начать собирать структуру семьи.";

  function updateSnapshot(updater: (prev: TreeSnapshot) => TreeSnapshot) {
    const nextSnapshot = updater(currentSnapshotRef.current);
    currentSnapshotRef.current = nextSnapshot;
    setCurrentSnapshot(nextSnapshot);
    return nextSnapshot;
  }

  function registerPendingTempPerson(tempPersonId: string) {
    if (tempPersonResolutionPromisesRef.current.has(tempPersonId) || resolvedTempPersonIdsRef.current.has(tempPersonId)) {
      return;
    }

    const promise = new Promise<string | null>((resolve) => {
      tempPersonResolutionResolversRef.current.set(tempPersonId, resolve);
    });
    tempPersonResolutionPromisesRef.current.set(tempPersonId, promise);
  }

  function settleTempPerson(tempPersonId: string, resolvedPersonId: string | null) {
    resolvedTempPersonIdsRef.current.set(tempPersonId, resolvedPersonId);
    const resolve = tempPersonResolutionResolversRef.current.get(tempPersonId);
    if (resolve) {
      resolve(resolvedPersonId);
    }
    tempPersonResolutionResolversRef.current.delete(tempPersonId);
    tempPersonResolutionPromisesRef.current.delete(tempPersonId);
  }

  async function resolveStablePersonId(personId: string | null) {
    if (!personId || !isTemporaryPersonId(personId)) {
      return personId;
    }

    if (resolvedTempPersonIdsRef.current.has(personId)) {
      return resolvedTempPersonIdsRef.current.get(personId) || null;
    }

    const pendingResolution = tempPersonResolutionPromisesRef.current.get(personId);
    if (!pendingResolution) {
      return null;
    }

    return pendingResolution;
  }

  useEffect(() => {
    currentSnapshotRef.current = currentSnapshot;
  }, [currentSnapshot]);

  useEffect(() => {
    if (selectedPersonId && peopleById.has(selectedPersonId)) {
      return;
    }

    const fallbackId = visualRootPersonId || currentSnapshot.people[0]?.id || null;
    setSelectedPersonId(fallbackId);
    setActivePanel("person");
    setPersonMode(fallbackId ? "edit" : "create");
    if (!fallbackId) {
      setCreateContext({ type: "standalone" });
    }
  }, [currentSnapshot.people, peopleById, selectedPersonId, visualRootPersonId]);

  useEffect(() => {
    currentSnapshotRef.current = snapshot;
    setCurrentSnapshot(snapshot);
    setVisualRootPersonId(getBuilderDefaultRootId(snapshot));
    setIsMediaLoaded(mediaLoaded);
    tempPersonResolutionPromisesRef.current.clear();
    tempPersonResolutionResolversRef.current.clear();
    resolvedTempPersonIdsRef.current.clear();
  }, [mediaLoaded, snapshot]);

  useEffect(() => {
    if (visualRootPersonId && peopleById.has(visualRootPersonId)) {
      return;
    }

    setVisualRootPersonId(getBuilderDefaultRootId(currentSnapshot));
  }, [currentSnapshot, peopleById, visualRootPersonId]);

  useEffect(() => {
    if (activePanel !== "media" || isMediaLoaded) {
      return;
    }

    void reloadSnapshot();
  }, [activePanel, isMediaLoaded]);

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

  async function addRelatedPerson(type: Exclude<CreateContext["type"], "standalone">, anchorPersonId: string) {
    const snapshotAtStart = currentSnapshotRef.current;
    const tempTimestamp = Date.now();
    const tempPersonId = `temp-person-${tempTimestamp}`;
    const tempRelationId = `temp-relation-${tempTimestamp}`;
    const tempNow = new Date().toISOString();
    const anchorPartnerships = snapshotAtStart.partnerships.filter(
      (partnership) => partnership.person_a_id === anchorPersonId || partnership.person_b_id === anchorPersonId
    );
    const defaultChildPartnerId =
      type === "child" && anchorPartnerships.length === 1
        ? anchorPartnerships[0]?.person_a_id === anchorPersonId
          ? anchorPartnerships[0].person_b_id
          : anchorPartnerships[0]?.person_a_id
        : null;
    const optimisticPerson: PersonRecord = {
      id: tempPersonId,
      tree_id: snapshotAtStart.tree.id,
      full_name: getAutoCreateName(type),
      gender: null,
      birth_date: null,
      death_date: null,
      birth_place: null,
      death_place: null,
      bio: null,
      is_living: true,
      created_by: snapshotAtStart.actor.userId,
      created_at: tempNow,
      updated_at: tempNow
    };
    const optimisticParentLinks: ParentLinkRecord[] =
      type === "child"
        ? [
            {
              id: tempRelationId,
              tree_id: snapshotAtStart.tree.id,
              parent_person_id: anchorPersonId,
              child_person_id: tempPersonId,
              relation_type: "biological",
              created_at: tempNow
            },
            ...(defaultChildPartnerId
              ? [
                  {
                    id: `${tempRelationId}-partner`,
                    tree_id: snapshotAtStart.tree.id,
                    parent_person_id: defaultChildPartnerId,
                    child_person_id: tempPersonId,
                    relation_type: "biological",
                    created_at: tempNow
                  }
                ]
              : [])
          ]
        : type === "parent"
          ? [
              {
                id: tempRelationId,
                tree_id: snapshotAtStart.tree.id,
                parent_person_id: tempPersonId,
                child_person_id: anchorPersonId,
                relation_type: "biological",
                created_at: tempNow
              }
            ]
          : [];
    const optimisticPartnership: PartnershipRecord | null =
      type === "partner"
        ? {
            id: tempRelationId,
            tree_id: snapshotAtStart.tree.id,
            person_a_id: anchorPersonId,
            person_b_id: tempPersonId,
            status: "partner",
            start_date: null,
            end_date: null,
            created_at: tempNow
          }
        : null;

    setActivePanel("person");
    setPersonMode("edit");
    setCreateContext({ type: "standalone" });
    registerPendingTempPerson(tempPersonId);
    updateSnapshot((prev) => ({
      ...prev,
      people: sortPeopleRecords([...prev.people, optimisticPerson]),
      parentLinks: optimisticParentLinks.length ? [...prev.parentLinks, ...optimisticParentLinks] : prev.parentLinks,
      partnerships: optimisticPartnership ? [...prev.partnerships, optimisticPartnership] : prev.partnerships
    }));
    setSelectedPersonId(tempPersonId);
    setStatus("Новый блок добавляется...");

    const created = await createPersonWithContext(
      {
        fullName: getAutoCreateName(type),
        isLiving: true
      },
      { type, anchorPersonId }
    );

    if (!created) {
      settleTempPerson(tempPersonId, null);
      updateSnapshot((prev) => ({
        ...prev,
        people: prev.people.filter((person) => person.id !== tempPersonId),
        parentLinks: prev.parentLinks.filter((link) => !optimisticParentLinks.some((optimisticLink) => optimisticLink.id === link.id)),
        partnerships: prev.partnerships.filter((partnership) => partnership.id !== tempRelationId)
      }));
      replaceSelectedPersonIfCurrent(setSelectedPersonId, tempPersonId, anchorPersonId);
      setStatus(null);
      return;
    }

    setStatus(`${created.createStatus} Заполните данные справа.`);
    updateSnapshot((prev) => {
      const promotedSnapshot = replacePersonIdInSnapshot(prev, tempPersonId, created.newPerson);
      return {
        ...promotedSnapshot,
        tree: created.updatedTree || promotedSnapshot.tree,
        parentLinks: created.newParentLink
          ? [
              ...promotedSnapshot.parentLinks.filter((link) => !optimisticParentLinks.some((optimisticLink) => optimisticLink.id === link.id)),
              created.newParentLink,
              ...(created.extraParentLinks || [])
            ]
          : promotedSnapshot.parentLinks.filter((link) => !optimisticParentLinks.some((optimisticLink) => optimisticLink.id === link.id)),
        partnerships: created.newPartnership
          ? [...promotedSnapshot.partnerships.filter((partnership) => partnership.id !== tempRelationId), created.newPartnership]
          : promotedSnapshot.partnerships.filter((partnership) => partnership.id !== tempRelationId)
      };
    });
    settleTempPerson(tempPersonId, created.newPerson.id);
    setVisualRootPersonId((currentRootId) => (currentRootId === tempPersonId ? created.newPerson.id : currentRootId));
    setCreateContext((currentContext) =>
      currentContext.type !== "standalone" && currentContext.anchorPersonId === tempPersonId
        ? { ...currentContext, anchorPersonId: created.newPerson.id }
        : currentContext
    );
    replaceSelectedPersonIfCurrent(setSelectedPersonId, tempPersonId, created.newPerson.id);
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
    async function rollbackCreatedPerson(personId: string, message: string) {
      await requestJson(`/api/persons/${personId}`, "DELETE", {});
      setError(message);
      return null;
    }

    setStatus(null);
    setError(null);
    const snapshotAtRequest = currentSnapshotRef.current;
    const created = await requestJson("/api/persons", "POST", {
      treeId: snapshotAtRequest.tree.id,
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
    let newParentLink: ParentLinkRecord | null = null;
    const extraParentLinks: ParentLinkRecord[] = [];
    let newPartnership: PartnershipRecord | null = null;
    let updatedTree: TreeSnapshot["tree"] | null = null;
    let createStatus = created.message || "Человек добавлен.";
    const resolvedAnchorPersonId =
      context.type === "standalone" ? null : await resolveStablePersonId(context.anchorPersonId);

    if (context.type !== "standalone" && !resolvedAnchorPersonId) {
      return rollbackCreatedPerson(newPerson.id, "Не удалось дождаться сохранения выбранного блока. Пустой блок откатан.");
    }

    if (context.type === "child") {
      const relation = await requestJson("/api/relationships/parent-child", "POST", {
        treeId: snapshotAtRequest.tree.id,
        parentPersonId: resolvedAnchorPersonId,
        childPersonId: newPerson.id,
        relationType: "biological"
      });
      if (!relation?.link) {
        return rollbackCreatedPerson(newPerson.id, "Не удалось привязать нового ребенка. Пустой блок откатан.");
      }
      newParentLink = relation.link;
      const anchorPartnerships = currentSnapshotRef.current.partnerships.filter(
        (partnership) => partnership.person_a_id === resolvedAnchorPersonId || partnership.person_b_id === resolvedAnchorPersonId
      );
      if (anchorPartnerships.length === 1) {
        const rawPartnerId =
          anchorPartnerships[0]?.person_a_id === resolvedAnchorPersonId ? anchorPartnerships[0].person_b_id : anchorPartnerships[0]?.person_a_id;
        const partnerId = await resolveStablePersonId(rawPartnerId);
        if (partnerId && partnerId !== resolvedAnchorPersonId) {
          const partnerRelation = await requestJson("/api/relationships/parent-child", "POST", {
            treeId: snapshotAtRequest.tree.id,
            parentPersonId: partnerId,
            childPersonId: newPerson.id,
            relationType: "biological"
          });
          if (!partnerRelation?.link) {
            return rollbackCreatedPerson(newPerson.id, "Не удалось привязать ребенка к паре. Пустой блок откатан.");
          }
          extraParentLinks.push(partnerRelation.link);
        }
        createStatus = "Блок добавлен и привязан как общий ребенок пары.";
      } else {
        createStatus = "Блок добавлен и привязан как ребенок.";
      }
    }

    if (context.type === "parent") {
      const relation = await requestJson("/api/relationships/parent-child", "POST", {
        treeId: snapshotAtRequest.tree.id,
        parentPersonId: newPerson.id,
        childPersonId: resolvedAnchorPersonId,
        relationType: "biological"
      });
      if (!relation?.link) {
        return rollbackCreatedPerson(newPerson.id, "Не удалось привязать нового родителя. Пустой блок откатан.");
      }
      newParentLink = relation.link;
      createStatus = "Блок добавлен и привязан как родитель.";
    }

    if (context.type === "partner") {
      const relation = await requestJson("/api/partnerships", "POST", {
        treeId: snapshotAtRequest.tree.id,
        personAId: resolvedAnchorPersonId,
        personBId: newPerson.id,
        status: "partner",
        startDate: null,
        endDate: null
      });
      if (!relation?.partnership) {
        return rollbackCreatedPerson(newPerson.id, "Не удалось привязать нового партнера. Пустой блок откатан.");
      }
      newPartnership = relation.partnership;
      createStatus = "Блок добавлен и привязан как партнер.";
    }

    if (snapshotAtRequest.people.length === 0) {
      const rootUpdate = await requestJson(`/api/trees/${snapshotAtRequest.tree.id}`, "PATCH", {
        title: snapshotAtRequest.tree.title,
        slug: snapshotAtRequest.tree.slug,
        description: snapshotAtRequest.tree.description || "",
        rootPersonId: newPerson.id
      });
      if (rootUpdate) {
        updatedTree = rootUpdate.tree || null;
        createStatus = "Первый блок добавлен и назначен корнем дерева.";
      }
    }

    return { newPerson, newParentLink, extraParentLinks, newPartnership, updatedTree, createStatus };
  }

  async function reloadSnapshot(options?: { includeMedia?: boolean }) {
    const includeMedia = options?.includeMedia ?? true;
    const suffix = includeMedia ? "?includeMedia=1" : "";
    const response = await fetch(`/api/tree/${currentSnapshotRef.current.tree.slug}/builder-snapshot${suffix}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) {
      setError((payload && payload.error) || "Не удалось обновить дерево после изменения.");
      return null;
    }

    currentSnapshotRef.current = payload;
    setCurrentSnapshot(payload);
    if (includeMedia) {
      setIsMediaLoaded(true);
    }
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
    setStatus(null);
    const payload = await requestJson(`/api/trees/${currentSnapshotRef.current.tree.id}`, "PATCH", {
      rootPersonId: personId
    });

    if (!payload?.tree) {
      return;
    }

    updateSnapshot((prev) => ({
      ...prev,
      tree: payload.tree
    }));
    setVisualRootPersonId(personId);
    setStatus(personId ? "Корень дерева обновлен." : "Корень дерева снят.");
    if (personId) {
      setSelectedPersonId(personId);
    }
  }

  async function submitCreatePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedPersonIdBeforeCreate = selectedPersonId;
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
    updateSnapshot((prev) => ({
      ...prev,
      tree: created.updatedTree || prev.tree,
      people: sortPeopleRecords([...prev.people, created.newPerson]),
      parentLinks: created.newParentLink ? [...prev.parentLinks, created.newParentLink, ...(created.extraParentLinks || [])] : prev.parentLinks,
      partnerships: created.newPartnership ? [...prev.partnerships, created.newPartnership] : prev.partnerships
    }));
    setActivePanel("person");
    setPersonMode("edit");
    setCreateContext({ type: "standalone" });
    replaceSelectedPersonIfCurrent(setSelectedPersonId, selectedPersonIdBeforeCreate, created.newPerson.id);
  }

  async function handleDeletePerson(person: PersonRecord) {
    const confirmed = window.confirm(`Удалить блок «${person.full_name}» вместе с его связями?`);
    if (!confirmed) {
      return;
    }

    const snapshotBeforeDelete = currentSnapshotRef.current;
    const selectedBeforeDelete = selectedPersonId;
    const activePanelBeforeDelete = activePanel;
    const personModeBeforeDelete = personMode;
    const createContextBeforeDelete = createContext;
    const fallbackPersonId = snapshotBeforeDelete.people.find((entry) => entry.id !== person.id)?.id || null;
    updateSnapshot(() => ({
      ...snapshotBeforeDelete,
      people: snapshotBeforeDelete.people.filter((entry) => entry.id !== person.id),
      parentLinks: snapshotBeforeDelete.parentLinks.filter((link) => link.parent_person_id !== person.id && link.child_person_id !== person.id),
      partnerships: snapshotBeforeDelete.partnerships.filter((partnership) => partnership.person_a_id !== person.id && partnership.person_b_id !== person.id),
      personMedia: snapshotBeforeDelete.personMedia.filter((relation) => relation.person_id !== person.id)
    }));
    const previousVisualRootPersonId = visualRootPersonId;
    if (visualRootPersonId === person.id) {
      setVisualRootPersonId(fallbackPersonId);
    }
    setSelectedPersonId(fallbackPersonId);
    setActivePanel("person");
    setPersonMode(fallbackPersonId ? "edit" : "create");
    setCreateContext({ type: "standalone" });
    setStatus("Удаляем человека...");

    let updatedTree: TreeSnapshot["tree"] | null = null;
    if (snapshotBeforeDelete.tree.root_person_id === person.id) {
      const rootUpdated = await requestJson(`/api/trees/${snapshotBeforeDelete.tree.id}`, "PATCH", {
        rootPersonId: fallbackPersonId
      });
      if (!rootUpdated && snapshotBeforeDelete.people.length > 1) {
        currentSnapshotRef.current = snapshotBeforeDelete;
        setCurrentSnapshot(snapshotBeforeDelete);
        setVisualRootPersonId(previousVisualRootPersonId);
        setSelectedPersonId(selectedBeforeDelete);
        setActivePanel(activePanelBeforeDelete);
        setPersonMode(personModeBeforeDelete);
        setCreateContext(createContextBeforeDelete);
        setStatus(null);
        return;
      }
      updatedTree = rootUpdated?.tree || null;
    }

    setStatus(null);
    const deleted = await requestJson(`/api/persons/${person.id}`, "DELETE", {});
    if (!deleted) {
      currentSnapshotRef.current = snapshotBeforeDelete;
      setCurrentSnapshot(snapshotBeforeDelete);
      setVisualRootPersonId(previousVisualRootPersonId);
      setSelectedPersonId(selectedBeforeDelete);
      setActivePanel(activePanelBeforeDelete);
      setPersonMode(personModeBeforeDelete);
      setCreateContext(createContextBeforeDelete);
      setStatus(null);
      return;
    }

    updateSnapshot((prev) => ({
      ...prev,
      tree: updatedTree || prev.tree,
      people: prev.people,
      parentLinks: prev.parentLinks,
      partnerships: prev.partnerships,
      personMedia: prev.personMedia
    }));
    setStatus(deleted.message || "Человек удален.");
  }

  async function removeParentLink(relationId: string) {
    setStatus(null);
    const payload = await requestJson(`/api/relationships/parent-child/${relationId}`, "DELETE", {});
    if (!payload) {
      return;
    }

    updateSnapshot((prev) => ({
      ...prev,
      parentLinks: prev.parentLinks.filter((link) => link.id !== relationId)
    }));
    setStatus(payload.message || "Связь родитель-ребенок удалена.");
  }

  async function removePartnership(relationId: string) {
    setStatus(null);
    const payload = await requestJson(`/api/partnerships/${relationId}`, "DELETE", {});
    if (!payload) {
      return;
    }

    updateSnapshot((prev) => ({
      ...prev,
      partnerships: prev.partnerships.filter((partnership) => partnership.id !== relationId)
    }));
    setStatus(payload.message || "Пара удалена.");
  }

  async function savePartnershipDate(partnershipId: string, startDate: string | null) {
    setStatus(null);
    const payload = await requestJson(`/api/partnerships/${partnershipId}`, "PATCH", {
      startDate
    });
    if (!payload?.partnership) {
      return;
    }

    updateSnapshot((prev) => ({
      ...prev,
      partnerships: prev.partnerships.map((partnership) => (partnership.id === partnershipId ? payload.partnership : partnership))
    }));
    setStatus(payload.message || "Дата пары обновлена.");
  }

  async function savePerson(personId: string, values: {
    fullName: string;
    gender: string | null;
    birthDate: string | null;
    deathDate: string | null;
    birthPlace: string | null;
    deathPlace: string | null;
    bio: string | null;
    isLiving: boolean;
  }) {
    setStatus(null);
    const payload = await requestJson(`/api/persons/${personId}`, "PATCH", values);
    if (!payload?.person) {
      return;
    }

    updateSnapshot((prev) => ({
      ...prev,
      people: sortPeopleRecords(prev.people.map((person) => (person.id === personId ? payload.person : person)))
    }));
    setStatus(payload.message || "Данные человека обновлены.");
  }

  function handleCanvasAction(personId: string, action: FamilyTreeCanvasAction) {
    if (action === "edit") {
      focusPerson(personId);
      return;
    }

    if (action === "add-parent") {
      void addRelatedPerson("parent", personId);
      return;
    }

    if (action === "add-child") {
      void addRelatedPerson("child", personId);
      return;
    }

    if (action === "add-partner") {
      void addRelatedPerson("partner", personId);
      return;
    }

    const person = peopleById.get(personId);
    if (person) {
      void handleDeletePerson(person);
    }
  }

  return (
    <div className="builder-layout builder-layout-reworked builder-layout-canvas">
      <aside className="surface-card builder-sidebar builder-sidebar-overlay">
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
                  {visualRootPersonId === person.id ? <span className="person-list-badge">Корень</span> : null}
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
        <div className="surface-card viewer-stage builder-stage builder-stage-canvas">
          <div className="stage-header builder-stage-header builder-stage-header-overlay">
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
            displayMode="builder"
            people={currentSnapshot.people}
            parentLinks={currentSnapshot.parentLinks}
            partnerships={currentSnapshot.partnerships}
            personPhotoUrls={personPhotoPreviewUrls}
            onPartnershipDateChange={savePartnershipDate}
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
                      <span>Отдельный блок создается без связи. Для мгновенного добавления родственника используйте + на карточке дерева.</span>
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
            ) : selectedPersonPending ? (
              <div className="builder-section-block">
                <div className="builder-section-heading">
                  <h3>Блок создается</h3>
                  <p className="muted-copy">Новый человек уже стоит на схеме. Дождитесь подтверждения сервера, и поля станут редактируемыми.</p>
                </div>
                <div className="builder-relation-empty">Сейчас запись создается в базе. Обычно это занимает несколько секунд.</div>
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
                    await savePerson(selectedPerson.id, {
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
                    <input name="fullName" defaultValue={selectedPerson.full_name} required suppressHydrationWarning />
                  </label>
                  <label>
                    Пол
                    <select name="gender" defaultValue={selectedPerson.gender || ""} suppressHydrationWarning>
                      {PERSON_GENDER_OPTIONS.map((option) => (
                        <option key={option.value || "none"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Дата рождения
                    <input name="birthDate" type="date" defaultValue={selectedPerson.birth_date || ""} suppressHydrationWarning />
                  </label>
                  <label>
                    Место рождения
                    <input name="birthPlace" defaultValue={selectedPerson.birth_place || ""} suppressHydrationWarning />
                  </label>
                  <label>
                    Дата смерти
                    <input name="deathDate" type="date" defaultValue={selectedPerson.death_date || ""} suppressHydrationWarning />
                  </label>
                  <label>
                    Место смерти
                    <input name="deathPlace" defaultValue={selectedPerson.death_place || ""} suppressHydrationWarning />
                  </label>
                  <label className="builder-field-span">
                    История
                    <textarea name="bio" rows={3} defaultValue={selectedPerson.bio || ""} suppressHydrationWarning />
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
                                    await removeParentLink(link.id);
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
                                    await removeParentLink(link.id);
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
                                    await removePartnership(partnership.id);
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
