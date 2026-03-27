"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type Dispatch, type FormEvent, type KeyboardEvent, type PointerEvent, type SetStateAction } from "react";
import { ArrowUpRight, CalendarDays, Camera, Pencil } from "lucide-react";
import { format as formatDateFn, parseISO } from "date-fns";

import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectField } from "@/components/ui/select-field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  FamilyTreeCanvas,
  type FamilyTreeCanvasAction
} from "@/components/tree/family-tree-canvas";
import { AvatarCropPreviewImage, BuilderAvatarPickerDialog } from "@/components/tree/builder-avatar-picker-dialog";
import { PersonMediaGallery } from "@/components/tree/person-media-gallery";
import { buildPrimaryPersonAvatarCrops, DEFAULT_AVATAR_CROP, getAvatarCropFromRelation } from "@/lib/avatar-crop";
import { buildBuilderDisplayTree, buildMediaOpenRouteUrl, buildPersonPhotoPreviewUrls, buildPhotoPreviewRouteUrl, collectPersonMedia } from "@/lib/tree/display";
import { formatDate, formatMediaUploadTransportHint, uploadFileWithTransportContract } from "@/lib/utils";
import type { AvatarCropValue, MediaUploadTargetResponse, ParentLinkRecord, PartnershipRecord, PersonRecord, TreeSnapshot } from "@/lib/types";

interface BuilderWorkspaceProps {
  snapshot: TreeSnapshot;
  mediaLoaded?: boolean;
}

type BuilderPanel = "person" | "relations" | "media";
type BuilderMediaMode = "all" | "photo" | "video" | "document" | "external";
type BuilderPersonMode = "create" | "edit";
type BuilderUploadScope = "photo" | "video" | "document";
type CreateContext =
  | { type: "standalone" }
  | { type: "parent"; anchorPersonId: string }
  | { type: "child"; anchorPersonId: string }
  | { type: "partner"; anchorPersonId: string };

const BUILDER_CANVAS_MIN_HEIGHT = 700;
const BUILDER_CANVAS_MAX_HEIGHT = 1600;
const MAX_MEDIA_FILES_PER_BATCH = 36;
const MAX_PHOTO_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_DOCUMENT_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const BIO_AUTOSAVE_DEBOUNCE_MS = 800;

type MediaUploadKind = "photo" | "video" | "document" | "unknown";
type MediaUploadStatus = "queued" | "uploading" | "finalizing" | "done" | "error";

type MediaUploadTargetRequest = Pick<
  MediaUploadTargetResponse,
  "signedUrl" | "uploadProvider" | "configuredBackend" | "resolvedUploadBackend" | "rolloutState" | "uploadMode" | "variantUploadMode" | "variantTargets"
>;

interface MediaUploadProgressSnapshot {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSecond: number | null;
  remainingMs: number | null;
}

interface MediaUploadQueueItem {
  id: string;
  name: string;
  kind: MediaUploadKind;
  sizeBytes: number;
  status: MediaUploadStatus;
  uploadedBytes: number;
  progressPercent: number;
  speedBytesPerSecond: number | null;
  remainingMs: number | null;
  message: string | null;
}

interface PendingMediaUploadItem {
  id: string;
  file: File;
  previewUrl: string | null;
}

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

function getBuilderUploadScopeConfig(scope: BuilderUploadScope) {
  if (scope === "photo") {
    return {
      heading: "Фото",
      inputLabel: "Фотографии с устройства",
      accept: "image/*",
      chooseButtonLabel: "Загрузить фото"
    };
  }

  if (scope === "video") {
    return {
      heading: "Видео",
      inputLabel: "Видео с устройства",
      accept: "video/*",
      chooseButtonLabel: "Загрузить видео"
    };
  }

  return {
    heading: "Документы",
    inputLabel: "Документы",
    accept: ".pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx",
    chooseButtonLabel: "Загрузить документы"
  };
}

function getBuilderUploadScopeFileSizeLimit(scope: BuilderUploadScope) {
  if (scope === "video") {
    return MAX_VIDEO_FILE_SIZE_BYTES;
  }

  if (scope === "document") {
    return MAX_DOCUMENT_FILE_SIZE_BYTES;
  }

  return MAX_PHOTO_FILE_SIZE_BYTES;
}

function detectMediaUploadKind(file: File): MediaUploadKind {
  if (file.type.startsWith("image/")) {
    return "photo";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  if (
    file.type === "application/pdf" ||
    file.type.startsWith("text/") ||
    file.type.includes("word") ||
    file.type.includes("officedocument") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("presentation") ||
    file.type === "application/rtf"
  ) {
    return "document";
  }

  return "unknown";
}

function formatMediaUploadBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "0 Б";
  }

  if (value >= 1024 * 1024 * 1024) {
    const scaledValue = value / (1024 * 1024 * 1024);
    return `${Number.isInteger(scaledValue) ? scaledValue : scaledValue.toFixed(1)} ГБ`;
  }

  if (value >= 1024 * 1024) {
    const scaledValue = value / (1024 * 1024);
    return `${Number.isInteger(scaledValue) ? scaledValue : scaledValue.toFixed(1)} МБ`;
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)} КБ`;
  }

  return `${Math.round(value)} Б`;
}

function formatPhotoUploadCountLabel(count: number) {
  return `${count} фото загружено`;
}

function formatMediaUploadQueueStatus(item: MediaUploadQueueItem) {
  if (item.status === "error") {
    return item.message || "Файл не загрузился";
  }

  if (item.status === "done") {
    return "Готово";
  }

  if (item.status === "finalizing") {
    return "Сохраняем файл";
  }

  if (item.status === "queued") {
    return "Файл ждет очереди";
  }

  return "Файл загружается";
}

function buildMediaUploadProgress(loadedBytes: number, totalBytes: number, startedAtMs: number): MediaUploadProgressSnapshot {
  const elapsedMs = Math.max(Date.now() - startedAtMs, 1);
  const speedBytesPerSecond = loadedBytes > 0 ? (loadedBytes / elapsedMs) * 1000 : null;
  const remainingBytes = Math.max(totalBytes - loadedBytes, 0);
  const remainingMs = speedBytesPerSecond && speedBytesPerSecond > 0 ? (remainingBytes / speedBytesPerSecond) * 1000 : null;
  const percent = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;

  return {
    uploadedBytes: loadedBytes,
    totalBytes,
    percent,
    speedBytesPerSecond,
    remainingMs
  };
}

function buildPendingMediaUploadItem(file: File): PendingMediaUploadItem {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : null
  };
}

function formatBuilderReviewFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} КБ`;
  }

  return `${sizeBytes} Б`;
}

function getBuilderPendingUploadKindLabel(file: File) {
  const kind = detectMediaUploadKind(file);

  if (kind === "photo") {
    return "Фото";
  }

  if (kind === "video") {
    return "Видео";
  }

  if (kind === "document") {
    return "Документ";
  }

  return "Файл";
}

function getInspectorAvatarFallback(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "АГ";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function getDisplayedBuilderGenderValue(value?: string | null) {
  return value === "male" || value === "female" ? value : "";
}

function formatBuilderMetaDateValue(value?: string | null) {
  if (!value) {
    return "";
  }

  try {
    return formatDateFn(parseISO(value), "dd.MM.yyyy");
  } catch {
    return "";
  }
}

function buildPersonInfoDraftValue(values: {
  gender?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  bio?: string | null;
}) {
  return {
    gender: values.gender || "",
    birthDate: values.birthDate || "",
    deathDate: values.deathDate || "",
    bio: values.bio || "",
  };
}

function arePersonInfoDraftValuesEqual(
  left: { gender: string; birthDate: string; deathDate: string; bio: string },
  right: { gender: string; birthDate: string; deathDate: string; bio: string }
) {
  return (
    left.gender === right.gender &&
    left.birthDate === right.birthDate &&
    left.deathDate === right.deathDate &&
    left.bio === right.bio
  );
}

function areStringSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function BuilderGenderToggleField({
  name,
  value,
  onValueChange,
  defaultValue = "",
  suppressHydrationWarning = false,
  className,
  itemClassName,
  ariaLabel = "Пол",
  iconOnly = false,
  spacing = 0,
}: {
  name?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string | null;
  suppressHydrationWarning?: boolean;
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
  iconOnly?: boolean;
  spacing?: number;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue || "");

  useEffect(() => {
    if (!isControlled) {
      setInternalValue(defaultValue || "");
    }
  }, [defaultValue, isControlled]);

  const currentValue = isControlled ? value || "" : internalValue;
  const displayedValue = getDisplayedBuilderGenderValue(currentValue);

  return (
    <>
      {name ? <input type="hidden" name={name} value={currentValue} readOnly suppressHydrationWarning={suppressHydrationWarning} /> : null}
      <ToggleGroup
        aria-label={ariaLabel}
        className={className || "grid w-full grid-cols-2 gap-2"}
        value={displayedValue ? [displayedValue] : []}
        onValueChange={(groupValue) => {
          const nextValue = groupValue[0];
          if (!nextValue) {
            return;
          }
          if (isControlled) {
            onValueChange?.(nextValue);
            return;
          }
          setInternalValue(nextValue);
        }}
        variant="outline"
        size="lg"
        multiple={false}
        spacing={spacing}
      >
        <ToggleGroupItem
          aria-label="Мужчина"
          className={itemClassName || "h-11 w-full justify-center rounded-md font-semibold"}
          value="male"
        >
          {iconOnly ? "♂" : "Мужчина"}
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label="Женщина"
          className={itemClassName || "h-11 w-full justify-center rounded-md font-semibold"}
          value="female"
        >
          {iconOnly ? "♀" : "Женщина"}
        </ToggleGroupItem>
      </ToggleGroup>
    </>
  );
}

function BuilderMetaDateField({
  name,
  defaultValue = "",
  value,
  onValueChange,
  ariaLabel,
}: {
  name: string;
  defaultValue?: string | null;
  value?: string;
  onValueChange?: (value: string) => void;
  ariaLabel: string;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue || "");

  useEffect(() => {
    if (!isControlled) {
      setInternalValue(defaultValue || "");
    }
  }, [defaultValue, isControlled]);

  const currentValue = isControlled ? value || "" : internalValue;
  const selectedDate = currentValue ? parseISO(currentValue) : undefined;

  return (
    <>
      <input
        type="text"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        value={currentValue}
        onChange={(event) => {
          if (isControlled) {
            onValueChange?.(event.currentTarget.value);
            return;
          }
          setInternalValue(event.currentTarget.value);
        }}
      />
      <Popover>
        <PopoverTrigger
          className="builder-inspector-meta-date-trigger"
          aria-label={ariaLabel}
          data-empty={currentValue ? "false" : "true"}
          data-field={name === "deathDate" ? "death" : "birth"}
        >
          <span className="builder-inspector-meta-date-trigger-text">{formatBuilderMetaDateValue(currentValue) || "дд.мм.гггг"}</span>
          <CalendarDays className="builder-inspector-meta-date-trigger-icon" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={(nextDate) => {
              const nextValue = nextDate ? formatDateFn(nextDate, "yyyy-MM-dd") : "";
              if (isControlled) {
                onValueChange?.(nextValue);
                return;
              }
              setInternalValue(nextValue);
            }}
            initialFocus
          />
          <div className="builder-inspector-meta-date-popover-actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (isControlled) {
                  onValueChange?.("");
                  return;
                }
                setInternalValue("");
              }}
            >
              Очистить
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

function buildBuilderPendingUploadsSummary(items: PendingMediaUploadItem[]) {
  const stats = items.reduce(
    (accumulator, item) => {
      accumulator.totalBytes += item.file.size;

      const kind = detectMediaUploadKind(item.file);
      if (kind === "photo") {
        accumulator.photoCount += 1;
      } else if (kind === "video") {
        accumulator.videoCount += 1;
      } else {
        accumulator.otherCount += 1;
      }

      return accumulator;
    },
    {
      totalBytes: 0,
      photoCount: 0,
      videoCount: 0,
      otherCount: 0,
    }
  );
  const parts = [`${items.length} ${items.length === 1 ? "файл" : items.length < 5 ? "файла" : "файлов"}`];

  if (stats.photoCount) {
    parts.push(`${stats.photoCount} фото`);
  }

  if (stats.videoCount) {
    parts.push(`${stats.videoCount} видео`);
  }

  if (stats.otherCount) {
    parts.push(`${stats.otherCount} ${stats.otherCount === 1 ? "документ" : stats.otherCount < 5 ? "документа" : "документов"}`);
  }

  parts.push(formatBuilderReviewFileSize(stats.totalBytes));

  return parts.join(" • ");
}

function revokePendingMediaUploadPreview(item: PendingMediaUploadItem) {
  if (item.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

async function uploadFileToMediaTarget(
  request: MediaUploadTargetRequest,
  file: File,
  onProgress?: (progress: MediaUploadProgressSnapshot) => void
) {
  const startedAtMs = Date.now();

  await uploadFileWithTransportContract({
    target: request,
    file,
    onProgress: (progress) => {
      onProgress?.(buildMediaUploadProgress(progress.uploadedBytes, progress.totalBytes || file.size, startedAtMs));
    },
    directErrorMessage: "Не удалось отправить файл напрямую в хранилище.",
    proxyErrorMessage: "Не удалось отправить файл на сервер.",
    proxyResponseErrorMessage: "Не удалось загрузить файл.",
    variantErrorMessage: "Не удалось подготовить preview-варианты.",
  });
}

function getPersonListMeta(person: PersonRecord) {
  const parts = [formatDate(person.birth_date), person.birth_place].filter(Boolean);
  return parts.length ? parts.join(" • ") : "Данные пока не заполнены";
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

function getBuilderStorageKey(treeId: string, key: "canvasHeight" | "activePanel" | "visualRootPersonId" | "selectedPersonId") {
  return `antigravity.builder.${treeId}.${key}`;
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
  const [isClientReady, setIsClientReady] = useState(false);
  const [isMediaLoaded, setIsMediaLoaded] = useState(mediaLoaded);
  const [visualRootPersonId, setVisualRootPersonId] = useState<string | null>(getBuilderDefaultRootId(snapshot));
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(getBuilderDefaultRootId(snapshot));
  const [activePanel, setActivePanel] = useState<BuilderPanel>("person");
  const [mediaMode, setMediaMode] = useState<BuilderMediaMode>("photo");
  const [personMode, setPersonMode] = useState<BuilderPersonMode>(snapshot.people.length ? "edit" : "create");
  const [createContext, setCreateContext] = useState<CreateContext>({ type: "standalone" });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaUploadTransportHint, setMediaUploadTransportHint] = useState<string | null>(null);
  const [mediaUploadItems, setMediaUploadItems] = useState<MediaUploadQueueItem[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [pendingMediaUploads, setPendingMediaUploads] = useState<PendingMediaUploadItem[]>([]);
  const [isMediaUploadReviewOpen, setIsMediaUploadReviewOpen] = useState(false);
  const [isMediaUploadDiscardConfirmOpen, setIsMediaUploadDiscardConfirmOpen] = useState(false);
  const [reviewMediaVisibility, setReviewMediaVisibility] = useState<"public" | "members">("public");
  const [reviewMediaCaption, setReviewMediaCaption] = useState("");
  const [isVideoAddPanelOpen, setIsVideoAddPanelOpen] = useState(false);
  const [isVideoLinkFormOpen, setIsVideoLinkFormOpen] = useState(false);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isEditingPersonName, setIsEditingPersonName] = useState(false);
  const [isSavingPersonName, setIsSavingPersonName] = useState(false);
  const [personNameDraft, setPersonNameDraft] = useState("");
  const [selectedPersonGenderDraft, setSelectedPersonGenderDraft] = useState("");
  const [selectedPersonBirthDateDraft, setSelectedPersonBirthDateDraft] = useState("");
  const [selectedPersonDeathDateDraft, setSelectedPersonDeathDateDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [personInfoAutosaveState, setPersonInfoAutosaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [expandedGalleryMode, setExpandedGalleryMode] = useState<"photo" | "video" | null>(null);
  const [isPhotoSelectionMode, setIsPhotoSelectionMode] = useState(false);
  const [selectedPhotoMediaIds, setSelectedPhotoMediaIds] = useState<Set<string>>(() => new Set());
  const [isBulkPhotoDeleteConfirmOpen, setIsBulkPhotoDeleteConfirmOpen] = useState(false);
  const [isBulkPhotoDeleting, setIsBulkPhotoDeleting] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(980);
  const [builderInspectorWidth, setBuilderInspectorWidth] = useState(440);
  const [isInspectorResizing, setIsInspectorResizing] = useState(false);
  const storageKeys = useMemo(
    () => ({
      canvasHeight: getBuilderStorageKey(snapshot.tree.id, "canvasHeight"),
      activePanel: getBuilderStorageKey(snapshot.tree.id, "activePanel"),
      visualRootPersonId: getBuilderStorageKey(snapshot.tree.id, "visualRootPersonId"),
      selectedPersonId: getBuilderStorageKey(snapshot.tree.id, "selectedPersonId"),
    }),
    [snapshot.tree.id]
  );
  const currentSnapshotRef = useRef(currentSnapshot);
  const resizeSessionRef = useRef<{ startHeight: number; startY: number } | null>(null);
  const builderLayoutRef = useRef<HTMLDivElement | null>(null);
  const tempPersonResolutionPromisesRef = useRef(new Map<string, Promise<string | null>>());
  const tempPersonResolutionResolversRef = useRef(new Map<string, (personId: string | null) => void>());
  const resolvedTempPersonIdsRef = useRef(new Map<string, string | null>());
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const reviewMediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingMediaUploadsRef = useRef<PendingMediaUploadItem[]>([]);
  const selectedPersonIdRef = useRef<string | null>(selectedPersonId);
  const personInfoDraftRef = useRef({ gender: "", birthDate: "", deathDate: "", bio: "" });
  const lastSavedPersonInfoRef = useRef({ gender: "", birthDate: "", deathDate: "", bio: "" });
  const personInfoSaveInFlightRef = useRef<{ personId: string; value: { gender: string; birthDate: string; deathDate: string; bio: string } } | null>(null);
  const personInfoSaveRequestIdRef = useRef(0);
  const renderSnapshot = useMemo<TreeSnapshot>(
    () =>
      isClientReady
        ? currentSnapshot
        : {
            ...currentSnapshot,
            people: [] as PersonRecord[],
            parentLinks: [] as ParentLinkRecord[],
            partnerships: [] as PartnershipRecord[],
            media: [],
            personMedia: []
          },
    [currentSnapshot, isClientReady]
  );
  const peopleById = useMemo(() => new Map(renderSnapshot.people.map((person) => [person.id, person])), [renderSnapshot.people]);
  const effectiveSnapshot = useMemo(
    () => ({
      ...renderSnapshot,
      tree: {
        ...renderSnapshot.tree,
        root_person_id: visualRootPersonId
      }
    }),
    [renderSnapshot, visualRootPersonId]
  );
  const displayTree = useMemo(() => (isClientReady ? buildBuilderDisplayTree(effectiveSnapshot) : null), [effectiveSnapshot, isClientReady]);
  const personPhotoPreviewUrls = useMemo(
    () => (isClientReady ? buildPersonPhotoPreviewUrls(renderSnapshot) : {}),
    [renderSnapshot.media, renderSnapshot.personMedia, isClientReady]
  );
  const personAvatarCrops = useMemo(
    () => (isClientReady ? buildPrimaryPersonAvatarCrops(renderSnapshot) : {}),
    [renderSnapshot.media, renderSnapshot.personMedia, isClientReady]
  );
  const selectedPerson = selectedPersonId ? peopleById.get(selectedPersonId) || null : null;
  const selectedPersonPending = Boolean(selectedPerson && isTemporaryPersonId(selectedPerson.id));
  const selectedMedia = selectedPerson ? collectPersonMedia(renderSnapshot, selectedPerson.id) : [];
  const selectedStorageMedia = selectedMedia.filter((asset) => asset.provider !== "yandex_disk");
  const selectedPhotoMedia = selectedStorageMedia.filter((asset) => asset.kind === "photo");
  const selectedVideoMedia = selectedMedia.filter((asset) => asset.kind === "video");
  const selectedDocumentMedia = selectedStorageMedia.filter((asset) => asset.kind === "document");
  const selectedPrimaryPhotoMediaId =
    selectedPerson
      ? renderSnapshot.personMedia.find(
          (relation) =>
            relation.person_id === selectedPerson.id &&
            relation.is_primary &&
            renderSnapshot.media.some((asset) => asset.id === relation.media_id && asset.kind === "photo")
        )?.media_id || null
      : null;
  const canDeleteSelectedPhotoMedia = currentSnapshot.actor.role === "owner" || currentSnapshot.actor.role === "admin";
  const selectedPhotoMediaCount = selectedPhotoMediaIds.size;
  const selectedAvatarUrl = selectedPerson ? personPhotoPreviewUrls[selectedPerson.id] || null : null;
  const selectedAvatarCrop = selectedPerson ? personAvatarCrops[selectedPerson.id] || DEFAULT_AVATAR_CROP : DEFAULT_AVATAR_CROP;
  const selectedPersonEditFormKey = selectedPerson ? selectedPerson.id : "edit-none";
  const anchorPerson = createContext.type === "standalone" ? null : peopleById.get(createContext.anchorPersonId) || null;
  const createHeading = getCreateContextHeading(createContext, anchorPerson);
  const createModeActive = activePanel === "person" && personMode === "create";
  const currentBuilderTab = activePanel === "media" ? (mediaMode === "video" ? "video" : "photo") : "info";
  const activeUploadScope: BuilderUploadScope = currentBuilderTab === "photo" ? "photo" : currentBuilderTab === "video" ? "video" : "document";
  const activeUploadConfig = getBuilderUploadScopeConfig(activeUploadScope);
  const selectedParentLinks = selectedPerson ? renderSnapshot.parentLinks.filter((link) => link.child_person_id === selectedPerson.id) : [];
  const selectedChildLinks = selectedPerson ? renderSnapshot.parentLinks.filter((link) => link.parent_person_id === selectedPerson.id) : [];
  const selectedPartnerships = selectedPerson
    ? renderSnapshot.partnerships.filter((partnership) => partnership.person_a_id === selectedPerson.id || partnership.person_b_id === selectedPerson.id)
    : [];
  const isSelectedRoot = Boolean(selectedPerson && visualRootPersonId === selectedPerson.id);
  const inspectorTitle = createModeActive ? createHeading.title : selectedPerson ? selectedPerson.full_name : "Выберите человека";
  const inspectorDescription = createModeActive
    ? "Заполните поля и сохраните новый блок."
    : selectedPersonPending
      ? "Блок создается. Как только сервер подтвердит запись, справа откроется обычное редактирование."
      : selectedPerson
      ? null
      : "Сначала выберите человека на схеме или в списке слева.";
  const canInlineEditInspectorName = activePanel === "person" && !createModeActive && !selectedPersonPending && Boolean(selectedPerson);
  const pendingMediaUploadsSummary = useMemo(
    () => buildBuilderPendingUploadsSummary(pendingMediaUploads),
    [pendingMediaUploads]
  );
  const stageTitle = expandedGalleryMode
    ? selectedPerson
      ? expandedGalleryMode === "photo"
        ? `Фото: ${selectedPerson.full_name}`
        : `Видео: ${selectedPerson.full_name}`
      : expandedGalleryMode === "photo"
        ? "Фото"
        : "Видео"
    : createModeActive
      ? "Основная схема семьи"
      : selectedPerson
        ? selectedPerson.full_name
        : "Основная схема семьи";
  const stageNote = expandedGalleryMode
    ? expandedGalleryMode === "photo"
      ? "Галерея вынесена на основную сцену, чтобы спокойно пролистывать снимки и выбирать аватар без узкой боковой колонки."
      : "Видео вынесены на основную сцену: здесь удобнее смотреть локальные ролики и переходить к внешним ссылкам."
    : createModeActive
      ? "Создайте новый отдельный блок. Для существующих карточек используйте +, чтобы сразу добавлять родственников в схему."
    : selectedPerson
        ? "Выберите блок, чтобы он подсветился. Кнопка + открывает меню связей, корзина удаляет выбранного человека."
        : "Выберите карточку на схеме или добавьте первого человека, чтобы начать собирать структуру семьи.";

  useEffect(() => {
    if (!status || status.endsWith("...")) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatus((currentStatus) => (currentStatus === status ? null : currentStatus));
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [status]);

  useEffect(() => {
    if (personInfoAutosaveState !== "saved") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPersonInfoAutosaveState((currentState) => (currentState === "saved" ? "idle" : currentState));
    }, 1600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [personInfoAutosaveState]);

  useEffect(() => {
    selectedPersonIdRef.current = selectedPersonId;
  }, [selectedPersonId]);

  useEffect(() => {
    if (!selectedPerson || createModeActive) {
      setIsAvatarPickerOpen(false);
    }
  }, [createModeActive, selectedPerson]);

  useEffect(() => {
    personInfoDraftRef.current = buildPersonInfoDraftValue({
      gender: selectedPersonGenderDraft,
      birthDate: selectedPersonBirthDateDraft,
      deathDate: selectedPersonDeathDateDraft,
      bio: bioDraft,
    });
  }, [selectedPersonGenderDraft, selectedPersonBirthDateDraft, selectedPersonDeathDateDraft, bioDraft]);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    if (!selectedPerson) {
      setIsEditingPersonName(false);
      setIsSavingPersonName(false);
      setPersonNameDraft("");
      setSelectedPersonGenderDraft("");
      setSelectedPersonBirthDateDraft("");
      setSelectedPersonDeathDateDraft("");
      setBioDraft("");
      lastSavedPersonInfoRef.current = buildPersonInfoDraftValue({});
      personInfoSaveInFlightRef.current = null;
      setPersonInfoAutosaveState("idle");
      return;
    }

    setPersonNameDraft(selectedPerson.full_name);
    setSelectedPersonGenderDraft(selectedPerson.gender || "");
    setSelectedPersonBirthDateDraft(selectedPerson.birth_date || "");
    setSelectedPersonDeathDateDraft(selectedPerson.death_date || "");
    setBioDraft(selectedPerson.bio || "");
    setIsEditingPersonName(false);
    setIsSavingPersonName(false);
  }, [selectedPerson?.id, selectedPerson?.full_name, selectedPerson?.gender, selectedPerson?.birth_date, selectedPerson?.death_date, selectedPerson?.bio]);

  useEffect(() => {
    lastSavedPersonInfoRef.current = buildPersonInfoDraftValue({
      gender: selectedPerson?.gender,
      birthDate: selectedPerson?.birth_date,
      deathDate: selectedPerson?.death_date,
      bio: selectedPerson?.bio,
    });
    personInfoSaveInFlightRef.current = null;
    setPersonInfoAutosaveState("idle");
  }, [selectedPerson?.id]);

  useEffect(() => {
    if (!selectedPerson || selectedPersonPending) {
      return;
    }

    const currentDraft = buildPersonInfoDraftValue({
      gender: selectedPersonGenderDraft,
      birthDate: selectedPersonBirthDateDraft,
      deathDate: selectedPersonDeathDateDraft,
      bio: bioDraft,
    });

    if (arePersonInfoDraftValuesEqual(currentDraft, lastSavedPersonInfoRef.current)) {
      return;
    }

    const inFlight = personInfoSaveInFlightRef.current;
    if (inFlight && inFlight.personId === selectedPerson.id && arePersonInfoDraftValuesEqual(inFlight.value, currentDraft)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void savePersonInfo(selectedPerson.id, personInfoDraftRef.current);
    }, BIO_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    bioDraft,
    selectedPerson?.id,
    selectedPersonGenderDraft,
    selectedPersonBirthDateDraft,
    selectedPersonDeathDateDraft,
    selectedPersonPending,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedHeight = Number(window.localStorage.getItem(storageKeys.canvasHeight));
    if (Number.isFinite(storedHeight) && storedHeight >= BUILDER_CANVAS_MIN_HEIGHT && storedHeight <= BUILDER_CANVAS_MAX_HEIGHT) {
      setCanvasHeight(Math.round(storedHeight));
      return;
    }

    const preferred = Math.round(window.innerHeight * 0.95);
    setCanvasHeight(Math.min(BUILDER_CANVAS_MAX_HEIGHT, Math.max(BUILDER_CANVAS_MIN_HEIGHT, preferred)));
  }, [storageKeys.canvasHeight]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedRootPersonId = window.localStorage.getItem(storageKeys.visualRootPersonId);
    if (storedRootPersonId && snapshot.people.some((person) => person.id === storedRootPersonId)) {
      setVisualRootPersonId(storedRootPersonId);
      setSelectedPersonId((currentSelectedPersonId) => currentSelectedPersonId || storedRootPersonId);
    }
  }, [snapshot.people, storageKeys.visualRootPersonId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedSelectedPersonId = window.localStorage.getItem(storageKeys.selectedPersonId);
    if (storedSelectedPersonId && snapshot.people.some((person) => person.id === storedSelectedPersonId)) {
      setSelectedPersonId(storedSelectedPersonId);
    }
  }, [snapshot.people, storageKeys.selectedPersonId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKeys.canvasHeight, String(canvasHeight));
  }, [canvasHeight, storageKeys.canvasHeight]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedPanel = window.localStorage.getItem(storageKeys.activePanel);
    if (storedPanel === "media") {
      setActivePanel("media");
      return;
    }

    if (storedPanel === "person" || storedPanel === "relations") {
      setActivePanel("person");
    }
  }, [storageKeys.activePanel]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKeys.activePanel, activePanel);
  }, [activePanel, storageKeys.activePanel]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (visualRootPersonId) {
      window.localStorage.setItem(storageKeys.visualRootPersonId, visualRootPersonId);
      return;
    }

    window.localStorage.removeItem(storageKeys.visualRootPersonId);
  }, [storageKeys.visualRootPersonId, visualRootPersonId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectedPersonId) {
      window.localStorage.setItem(storageKeys.selectedPersonId, selectedPersonId);
      return;
    }

    window.localStorage.removeItem(storageKeys.selectedPersonId);
  }, [selectedPersonId, storageKeys.selectedPersonId]);

  useEffect(() => {
    if (activePanel !== "media") {
      setExpandedGalleryMode(null);
      return;
    }

    if (expandedGalleryMode && currentBuilderTab !== expandedGalleryMode) {
      setExpandedGalleryMode(null);
    }
  }, [activePanel, currentBuilderTab, expandedGalleryMode]);

  useEffect(() => {
    if (!isInspectorResizing) {
      return undefined;
    }

    function handlePointerMove(event: globalThis.PointerEvent) {
      const layout = builderLayoutRef.current;
      if (!layout) {
        return;
      }

      const rect = layout.getBoundingClientRect();
      const nextWidth = rect.right - event.clientX;
      const maxWidth = Math.min(720, Math.max(420, rect.width - 320));
      setBuilderInspectorWidth(Math.max(360, Math.min(maxWidth, nextWidth)));
    }

    function stopResize() {
      setIsInspectorResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    };
  }, [isInspectorResizing]);

  useEffect(() => {
    setIsPhotoSelectionMode(false);
    setSelectedPhotoMediaIds(new Set());
    setIsBulkPhotoDeleteConfirmOpen(false);
    setIsBulkPhotoDeleting(false);
  }, [selectedPersonId, currentBuilderTab]);

  useEffect(() => {
    if (!canDeleteSelectedPhotoMedia) {
      setIsPhotoSelectionMode(false);
      setSelectedPhotoMediaIds((currentSelection) => (currentSelection.size ? new Set() : currentSelection));
      setIsBulkPhotoDeleteConfirmOpen(false);
      return;
    }

    const availablePhotoIds = new Set(selectedPhotoMedia.map((asset) => asset.id));
    setSelectedPhotoMediaIds((currentSelection) => {
      const nextSelection = new Set([...currentSelection].filter((mediaId) => availablePhotoIds.has(mediaId)));
      return areStringSetsEqual(currentSelection, nextSelection) ? currentSelection : nextSelection;
    });
  }, [canDeleteSelectedPhotoMedia, selectedPhotoMedia]);

  useEffect(() => {
    if (!selectedPhotoMediaCount && isBulkPhotoDeleteConfirmOpen) {
      setIsBulkPhotoDeleteConfirmOpen(false);
    }
  }, [isBulkPhotoDeleteConfirmOpen, selectedPhotoMediaCount]);

  useEffect(() => {
    if (!selectedPhotoMediaCount && isPhotoSelectionMode) {
      setIsPhotoSelectionMode(false);
    }
  }, [isPhotoSelectionMode, selectedPhotoMediaCount]);

  function startCanvasResize(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    resizeSessionRef.current = {
      startHeight: canvasHeight,
      startY: event.clientY
    };

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      const session = resizeSessionRef.current;
      if (!session) {
        return;
      }

      const nextHeight = session.startHeight + (moveEvent.clientY - session.startY);
      const clampedHeight = Math.min(BUILDER_CANVAS_MAX_HEIGHT, Math.max(BUILDER_CANVAS_MIN_HEIGHT, Math.round(nextHeight)));
      setCanvasHeight(clampedHeight);
    }

    function stopResize() {
      resizeSessionRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  }

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
    for (const item of pendingMediaUploadsRef.current) {
      revokePendingMediaUploadPreview(item);
    }
    pendingMediaUploadsRef.current = [];
    setPendingMediaUploads([]);
    setIsMediaUploadReviewOpen(false);
    setIsMediaUploadDiscardConfirmOpen(false);
    if (mediaFileInputRef.current) {
      mediaFileInputRef.current.value = "";
    }
    if (reviewMediaFileInputRef.current) {
      reviewMediaFileInputRef.current.value = "";
    }
  }, [selectedPersonId]);

  useEffect(() => {
    pendingMediaUploadsRef.current = pendingMediaUploads;
  }, [pendingMediaUploads]);

  useEffect(() => {
    return () => {
      for (const item of pendingMediaUploadsRef.current) {
        revokePendingMediaUploadPreview(item);
      }
    };
  }, []);

  useEffect(() => {
    if (!isClientReady) {
      return;
    }

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
  }, [currentSnapshot.people, isClientReady, peopleById, selectedPersonId, visualRootPersonId]);

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
    setStatus(null);

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

    setStatus(null);
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

  async function requestJsonRaw(url: string, method: string, body: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }

  async function requestJsonOrThrow(url: string, method: string, body: unknown) {
    const { response, payload } = await requestJsonRaw(url, method, body);
    if (!response.ok) {
      throw new Error(payload.error || "Запрос не выполнен.");
    }

    return payload;
  }

  async function requestJson(url: string, method: string, body: unknown) {
    setError(null);
    const { response, payload } = await requestJsonRaw(url, method, body);
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

  function switchToPhotoTab() {
    setMediaMode("photo");
    setActivePanel("media");
  }

  async function savePersonAvatar(mediaId: string, avatarCrop?: AvatarCropValue) {
    if (!selectedPerson) {
      return false;
    }

    setStatus(null);
    const payload = await requestJson(`/api/media/${mediaId}`, "PATCH", {
      personId: selectedPerson.id,
      setPrimary: true,
      avatarCrop
    });
    if (!payload?.relation) {
      return false;
    }

    const nextCrop = getAvatarCropFromRelation(payload.relation);
    updateSnapshot((prev) => {
      let relationFound = false;
      const nextPersonMedia = prev.personMedia.map((relation) => {
        if (relation.person_id !== selectedPerson.id) {
          return relation;
        }

        if (relation.media_id === mediaId) {
          relationFound = true;
          return {
            ...relation,
            is_primary: true,
            avatar_crop_x: nextCrop.x,
            avatar_crop_y: nextCrop.y,
            avatar_crop_zoom: nextCrop.zoom
          };
        }

        return {
          ...relation,
          is_primary: false
        };
      });

      if (!relationFound) {
        nextPersonMedia.push({
          ...payload.relation,
          person_id: selectedPerson.id,
          media_id: mediaId,
          is_primary: true,
          avatar_crop_x: nextCrop.x,
          avatar_crop_y: nextCrop.y,
          avatar_crop_zoom: nextCrop.zoom
        });
      }

      return {
        ...prev,
        personMedia: nextPersonMedia
      };
    });

    setStatus(payload.message || "Аватар обновлен.");
    return true;
  }

  async function requestBuilderPhotoDelete(mediaId: string) {
    const { response, payload } = await requestJsonRaw(`/api/media/${mediaId}`, "DELETE", {});
    if (!response.ok) {
      throw new Error(payload.error || "Не удалось удалить фото.");
    }

    return payload;
  }

  function patchDeletedMedia(mediaIds: Iterable<string>) {
    const deletedMediaIds = new Set(mediaIds);
    if (!deletedMediaIds.size) {
      return;
    }

    updateSnapshot((prev) => ({
      ...prev,
      media: prev.media.filter((asset) => !deletedMediaIds.has(asset.id)),
      personMedia: prev.personMedia.filter((relation) => !deletedMediaIds.has(relation.media_id)),
    }));
  }

  async function deleteBuilderPhoto(mediaId: string) {
    setStatus(null);
    setError(null);

    try {
      const payload = await requestBuilderPhotoDelete(mediaId);
      patchDeletedMedia([mediaId]);
      setStatus(payload.message || "Фото удалено.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Не удалось удалить фото.";
      setError(message);
      throw deleteError;
    }
  }

  function toggleSelectedPhotoMedia(mediaId: string) {
    if (!canDeleteSelectedPhotoMedia) {
      return;
    }

    setSelectedPhotoMediaIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);
      if (nextSelection.has(mediaId)) {
        nextSelection.delete(mediaId);
      } else {
        nextSelection.add(mediaId);
      }
      return nextSelection;
    });
  }

  function startPhotoSelectionMode(mediaId: string) {
    if (!canDeleteSelectedPhotoMedia) {
      return;
    }

    setIsPhotoSelectionMode(true);
    setSelectedPhotoMediaIds((currentSelection) => new Set([...currentSelection, mediaId]));
  }

  function clearSelectedPhotoMedia() {
    setIsPhotoSelectionMode(false);
    setSelectedPhotoMediaIds(new Set());
    setIsBulkPhotoDeleteConfirmOpen(false);
  }

  async function deleteSelectedBuilderPhotos() {
    const mediaIdsToDelete = [...selectedPhotoMediaIds];
    if (!mediaIdsToDelete.length || isBulkPhotoDeleting) {
      return;
    }

    setStatus(null);
    setError(null);
    setIsBulkPhotoDeleting(true);

    const deletedMediaIds: string[] = [];
    let firstErrorMessage: string | null = null;

    try {
      for (const mediaId of mediaIdsToDelete) {
        try {
          await requestBuilderPhotoDelete(mediaId);
          deletedMediaIds.push(mediaId);
        } catch (deleteError) {
          if (!firstErrorMessage) {
            firstErrorMessage = deleteError instanceof Error ? deleteError.message : "Не удалось удалить выбранные фото.";
          }
        }
      }

      if (deletedMediaIds.length) {
        patchDeletedMedia(deletedMediaIds);
      }

      clearSelectedPhotoMedia();

      if (deletedMediaIds.length === mediaIdsToDelete.length) {
        setStatus(`Удалено ${deletedMediaIds.length} ${deletedMediaIds.length === 1 ? "фото" : "фото"}.`);
      } else if (deletedMediaIds.length > 0) {
        setStatus(`Удалено ${deletedMediaIds.length} из ${mediaIdsToDelete.length} фото.`);
      }

      if (firstErrorMessage) {
        setError(firstErrorMessage);
      }
    } finally {
      setIsBulkPhotoDeleting(false);
    }
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

  async function savePersonInfo(
    personId: string,
    nextValues: { gender: string; birthDate: string; deathDate: string; bio: string }
  ) {
    if (arePersonInfoDraftValuesEqual(nextValues, lastSavedPersonInfoRef.current)) {
      return null;
    }

    const inFlight = personInfoSaveInFlightRef.current;
    if (inFlight && inFlight.personId === personId && arePersonInfoDraftValuesEqual(inFlight.value, nextValues)) {
      return null;
    }

    const requestId = ++personInfoSaveRequestIdRef.current;
    personInfoSaveInFlightRef.current = { personId, value: nextValues };
    setPersonInfoAutosaveState("saving");

    const payload = await requestJson(`/api/persons/${personId}`, "PATCH", {
      gender: nextValues.gender || null,
      birthDate: nextValues.birthDate || null,
      deathDate: nextValues.deathDate || null,
      bio: nextValues.bio || null,
      isLiving: !nextValues.deathDate,
    });

    if (
      personInfoSaveInFlightRef.current &&
      personInfoSaveInFlightRef.current.personId === personId &&
      arePersonInfoDraftValuesEqual(personInfoSaveInFlightRef.current.value, nextValues)
    ) {
      personInfoSaveInFlightRef.current = null;
    }

    if (!payload?.person) {
      if (personInfoSaveRequestIdRef.current === requestId) {
        setPersonInfoAutosaveState("idle");
      }
      return null;
    }

    const updatedPerson = {
      ...payload.person,
      gender: nextValues.gender || null,
      birth_date: nextValues.birthDate || null,
      death_date: nextValues.deathDate || null,
      bio: nextValues.bio || null,
    } as PersonRecord;

    updateSnapshot((prev) => ({
      ...prev,
      people: sortPeopleRecords(prev.people.map((person) => (person.id === personId ? updatedPerson : person)))
    }));
    if (selectedPersonIdRef.current === personId) {
      lastSavedPersonInfoRef.current = buildPersonInfoDraftValue({
        gender: updatedPerson.gender,
        birthDate: updatedPerson.birth_date,
        deathDate: updatedPerson.death_date,
        bio: updatedPerson.bio,
      });
    }

    if (
      selectedPersonIdRef.current === personId &&
      personInfoSaveRequestIdRef.current === requestId &&
      arePersonInfoDraftValuesEqual(personInfoDraftRef.current, lastSavedPersonInfoRef.current)
    ) {
      setPersonInfoAutosaveState("saved");
    }

    return updatedPerson;
  }

  async function savePersonName(personId: string, fullName: string) {
    setStatus(null);
    setError(null);
    setIsSavingPersonName(true);
    const payload = await requestJson(`/api/persons/${personId}`, "PATCH", { fullName });
    setIsSavingPersonName(false);
    if (!payload?.person) {
      return null;
    }

    updateSnapshot((prev) => ({
      ...prev,
      people: sortPeopleRecords(prev.people.map((person) => (person.id === personId ? payload.person : person)))
    }));
    setStatus(payload.message || "Данные человека обновлены.");
    return payload.person as PersonRecord;
  }

  function startPersonNameEdit() {
    if (!selectedPerson || !canInlineEditInspectorName) {
      return;
    }

    setError(null);
    setPersonNameDraft(selectedPerson.full_name);
    setIsEditingPersonName(true);
  }

  async function commitPersonNameEdit() {
    if (!selectedPerson || isSavingPersonName) {
      return;
    }

    const nextName = personNameDraft.trim();
    if (nextName === selectedPerson.full_name) {
      setPersonNameDraft(selectedPerson.full_name);
      setIsEditingPersonName(false);
      return;
    }

    if (nextName.length < 2) {
      setError("Полное имя должно быть не короче 2 символов.");
      return;
    }

    const updatedPerson = await savePersonName(selectedPerson.id, nextName);
    if (!updatedPerson) {
      return;
    }

    setPersonNameDraft(updatedPerson.full_name);
    setIsEditingPersonName(false);
  }

  function updateMediaUploadItem(itemId: string, updates: Partial<MediaUploadQueueItem>) {
    setMediaUploadItems((items) => items.map((item) => (item.id === itemId ? { ...item, ...updates } : item)));
  }

  function getMediaUploadFormValues() {
    return {
      visibility: reviewMediaVisibility,
      caption: reviewMediaCaption.trim()
    };
  }

  function validatePendingMediaFiles(files: File[]) {
    const maxFileSizeBytes = getBuilderUploadScopeFileSizeLimit(activeUploadScope);

    if (!files.length) {
      return "Сначала выберите хотя бы один файл.";
    }

    if (files.length > MAX_MEDIA_FILES_PER_BATCH) {
      return `За один раз можно загрузить не больше ${MAX_MEDIA_FILES_PER_BATCH} файлов.`;
    }

    const oversizedFiles = files.filter((file) => file.size > maxFileSizeBytes);
    if (oversizedFiles.length) {
      return `Файл больше ${formatMediaUploadBytes(maxFileSizeBytes)}: ${oversizedFiles
        .slice(0, 3)
        .map((file) => file.name)
        .join(", ")}.`;
    }

    return null;
  }

  function clearPendingMediaUploads() {
    for (const item of pendingMediaUploadsRef.current) {
      revokePendingMediaUploadPreview(item);
    }

    pendingMediaUploadsRef.current = [];
    setPendingMediaUploads([]);
    setIsMediaUploadReviewOpen(false);
    setIsMediaUploadDiscardConfirmOpen(false);
    setReviewMediaVisibility("public");
    setReviewMediaCaption("");

    if (mediaFileInputRef.current) {
      mediaFileInputRef.current.value = "";
    }

    if (reviewMediaFileInputRef.current) {
      reviewMediaFileInputRef.current.value = "";
    }
  }

  function appendPendingMediaFiles(nextFiles: File[], options?: { openReview?: boolean }) {
    const sanitizedFiles = nextFiles.filter((file) => file.size > 0);
    if (!sanitizedFiles.length) {
      return;
    }

    const allFiles = [...pendingMediaUploadsRef.current.map((item) => item.file), ...sanitizedFiles];
    const validationError = validatePendingMediaFiles(allFiles);
    if (validationError) {
      setError(validationError);
      return;
    }

    const nextItems = sanitizedFiles.map((file) => buildPendingMediaUploadItem(file));
    const combinedItems = [...pendingMediaUploadsRef.current, ...nextItems];
    pendingMediaUploadsRef.current = combinedItems;
    setPendingMediaUploads(combinedItems);
    setError(null);
    setStatus(null);
    setMediaUploadTransportHint(null);

    if (options?.openReview !== false) {
      setIsMediaUploadReviewOpen(true);
    }
  }

  function handleMediaFileSelection(event: ChangeEvent<HTMLInputElement>) {
    appendPendingMediaFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function handleReviewMediaFileSelection(event: ChangeEvent<HTMLInputElement>) {
    appendPendingMediaFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function openMediaPickerOrReview() {
    if (pendingMediaUploadsRef.current.length) {
      setError(null);
      setIsMediaUploadReviewOpen(true);
      return;
    }

    mediaFileInputRef.current?.click();
  }

  function handleVideoAddPanelOpenChange(open: boolean) {
    setIsVideoAddPanelOpen(open);
    if (!open) {
      setIsVideoLinkFormOpen(false);
    }
  }

  function renderMediaAddTileContent(label: string) {
    return (
      <span className="person-media-thumb-visual builder-media-add-tile-visual">
        <span className="builder-media-add-tile-plus" aria-hidden="true">+</span>
        <span className="builder-media-add-tile-label">{label}</span>
      </span>
    );
  }

  function renderPhotoAddTile() {
    return (
      <button
        type="button"
        className="person-media-thumb person-media-thumb-compact builder-media-add-tile"
        aria-label="Добавить фото"
        onClick={openMediaPickerOrReview}
      >
        {renderMediaAddTileContent("Добавить фото")}
      </button>
    );
  }

  function renderVideoAddTile() {
    return (
      <Popover open={isVideoAddPanelOpen} onOpenChange={handleVideoAddPanelOpenChange}>
        <PopoverTrigger
          className="person-media-thumb person-media-thumb-compact builder-media-add-tile"
          aria-label="Добавить видео"
        >
          {renderMediaAddTileContent("Добавить видео")}
        </PopoverTrigger>
        <PopoverContent className="builder-video-add-popover" align="start" sideOffset={8}>
          {!isVideoLinkFormOpen ? (
            <div className="archive-action-bar builder-video-add-actions">
              <Button
                type="button"
                variant="ghost"
                className="builder-video-link-toggle"
                onClick={() => {
                  setIsVideoAddPanelOpen(false);
                  openMediaPickerOrReview();
                }}
              >
                Загрузить видео
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="builder-video-link-toggle"
                onClick={() => setIsVideoLinkFormOpen(true)}
              >
                Видео по ссылке
              </Button>
            </div>
          ) : (
            <form
              className="stack-form builder-form-grid builder-video-link-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const selectedPersonId = selectedPerson?.id;
                if (!selectedPersonId) {
                  setIsVideoLinkFormOpen(false);
                  setIsVideoAddPanelOpen(false);
                  return;
                }
                const form = new FormData(event.currentTarget);
                await submitJson("/api/media/complete", "POST", {
                  treeId: currentSnapshot.tree.id,
                  personId: selectedPersonId,
                  mediaId: crypto.randomUUID(),
                  provider: "yandex_disk",
                  externalUrl: String(form.get("externalUrl") || "").trim(),
                  visibility: String(form.get("visibility") || "public"),
                  title: String(form.get("title") || "").trim(),
                  caption: String(form.get("caption") || "").trim()
                });

                event.currentTarget.reset();
                setIsVideoLinkFormOpen(false);
                setIsVideoAddPanelOpen(false);
              }}
            >
              <label className="form-field builder-field-span">
                Ссылка на видео
                <Input name="externalUrl" type="url" required placeholder="https://disk.yandex.ru/..." />
              </label>
              <label className="form-field">
                Название
                <Input name="title" required placeholder="Семейная хроника" />
              </label>
              <label className="form-field">
                Видимость
                <SelectField name="visibility" defaultValue="public">
                  <option value="public">Всем по ссылке</option>
                  <option value="members">Только участникам</option>
                </SelectField>
              </label>
              <label className="form-field builder-field-span">
                Подпись
                <Textarea name="caption" rows={3} placeholder="Например: оцифрованная запись, семейный архив или внешний видеоплеер" />
              </label>
              <Button className="builder-field-span" type="submit">
                Добавить видео по ссылке
              </Button>
            </form>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  function removePendingMediaUpload(itemId: string) {
    setPendingMediaUploads((items) => {
      const item = items.find((entry) => entry.id === itemId);
      if (item) {
        revokePendingMediaUploadPreview(item);
      }

      const nextItems = items.filter((entry) => entry.id !== itemId);
      pendingMediaUploadsRef.current = nextItems;

      if (!nextItems.length) {
        setIsMediaUploadReviewOpen(false);
        setIsMediaUploadDiscardConfirmOpen(false);
      }

      return nextItems;
    });
  }

  function hideMediaUploadReview() {
    setIsMediaUploadReviewOpen(false);
    setIsMediaUploadDiscardConfirmOpen(false);
  }

  function requestCloseMediaUploadReview() {
    if (isUploadingMedia) {
      return;
    }

    if (pendingMediaUploadsRef.current.length) {
      setIsMediaUploadDiscardConfirmOpen(true);
      return;
    }

    setIsMediaUploadReviewOpen(false);
  }

  function discardPendingMediaUploads() {
    clearPendingMediaUploads();
  }

  function handleSubmitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function uploadSelectedMediaFiles(files: File[], formValues: { visibility: string; caption: string }) {
    if (!selectedPerson) {
      setError("Сначала выберите человека, чтобы привязать к нему медиа.");
      return;
    }

    const uploadQueue = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      kind: detectMediaUploadKind(file),
      sizeBytes: file.size,
      status: "queued" as const,
      uploadedBytes: 0,
      progressPercent: 0,
      speedBytesPerSecond: null,
      remainingMs: null,
      message: null
    }));

    setError(null);
    setStatus(null);
    setMediaUploadTransportHint(null);
    setIsUploadingMedia(true);
    setMediaUploadItems(uploadQueue);

    let uploadedCount = 0;
    const failedFiles: string[] = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const queueItem = uploadQueue[index];

        try {
          updateMediaUploadItem(queueItem.id, {
            status: "uploading",
            message: "Загружается..."
          });

          const resolvedTitle = file.name;

          const request = await requestJsonOrThrow("/api/media/upload-intent", "POST", {
            treeId: currentSnapshotRef.current.tree.id,
            personId: selectedPerson.id,
            filename: file.name,
            mimeType: file.type,
            visibility: formValues.visibility,
            title: resolvedTitle,
            caption: formValues.caption
          });
          setMediaUploadTransportHint(formatMediaUploadTransportHint(request));

          await uploadFileToMediaTarget(request, file, (progress) => {
            updateMediaUploadItem(queueItem.id, {
              status: "uploading",
              uploadedBytes: progress.uploadedBytes,
              progressPercent: progress.percent,
              speedBytesPerSecond: progress.speedBytesPerSecond,
              remainingMs: progress.remainingMs,
              message: "Загружается..."
            });
          });

          updateMediaUploadItem(queueItem.id, {
            status: "finalizing",
            progressPercent: 100,
            uploadedBytes: file.size,
            speedBytesPerSecond: null,
            remainingMs: null,
            message: "Сохраняется..."
          });

          await requestJsonOrThrow("/api/media/complete", "POST", {
            treeId: currentSnapshotRef.current.tree.id,
            personId: selectedPerson.id,
            mediaId: request.mediaId,
            storagePath: request.path,
            variantPaths: request.variantTargets?.map((item: { variant: "thumb" | "small" | "medium"; path: string }) => ({
              variant: item.variant,
              storagePath: item.path
            })),
            visibility: formValues.visibility,
            title: resolvedTitle,
            caption: formValues.caption,
            mimeType: file.type,
            sizeBytes: file.size
          });

          uploadedCount += 1;
          updateMediaUploadItem(queueItem.id, {
            status: "done",
            progressPercent: 100,
            uploadedBytes: file.size,
            message: "Загружено"
          });
        } catch (uploadError) {
          failedFiles.push(file.name);
          updateMediaUploadItem(queueItem.id, {
            status: "error",
            message: uploadError instanceof Error ? uploadError.message : "Файл не загрузился."
          });
        }
      }

      if (uploadedCount > 0) {
        await reloadSnapshot();
      }

      if (uploadedCount > 0) {
        setStatus(
          failedFiles.length
            ? `Загружено ${uploadedCount} из ${files.length} файлов.`
            : `Загружено ${uploadedCount} ${uploadedCount === 1 ? "файл" : uploadedCount < 5 ? "файла" : "файлов"}.`
        );
      }

      if (failedFiles.length) {
        setError(`Не удалось загрузить: ${failedFiles.slice(0, 3).join(", ")}${failedFiles.length > 3 ? "..." : ""}.`);
      }
    } finally {
      setIsUploadingMedia(false);
    }
  }

  async function savePendingMediaUploads() {
    if (!pendingMediaUploadsRef.current.length) {
      setIsMediaUploadReviewOpen(false);
      return;
    }

    const files = pendingMediaUploadsRef.current.map((item) => item.file);
    const formValues = getMediaUploadFormValues();

    clearPendingMediaUploads();
    await uploadSelectedMediaFiles(files, formValues);
  }

  function openExpandedGallery(mode: "photo" | "video") {
    setMediaMode(mode);
    setActivePanel("media");
    setExpandedGalleryMode(mode);
  }

  function closeExpandedGallery() {
    setExpandedGalleryMode(null);
  }

  function buildSelectedArchiveHref(mode: "photo" | "video") {
    const selectedMedia = mode === "photo" ? selectedPhotoMedia : selectedVideoMedia;
    const params = new URLSearchParams({
      mode,
      view: "albums"
    });
    const actorUserId = currentSnapshot.actor.userId;
    const preferredUploaderUserId =
      (actorUserId && selectedMedia.some((asset) => asset.created_by === actorUserId) ? actorUserId : null) ||
      selectedMedia.find((asset) => asset.created_by)?.created_by ||
      null;

    if (preferredUploaderUserId) {
      params.set("album", `uploader-${preferredUploaderUserId}`);
    }

    return `/tree/${currentSnapshot.tree.slug}/media?${params.toString()}`;
  }

  function buildPhotoArchiveHrefForMedia(asset: TreeSnapshot["media"][number]) {
    const params = new URLSearchParams({
      mode: "photo",
      view: "albums",
    });

    if (asset.created_by) {
      params.set("album", `uploader-${asset.created_by}`);
    }

    return `/tree/${currentSnapshot.tree.slug}/media?${params.toString()}`;
  }

  function renderExpandedGalleryFooter(mode: "photo" | "video") {
    const mediaCount = mode === "photo" ? selectedPhotoMedia.length : selectedVideoMedia.length;

    return (
      <div className="archive-sticky-footer builder-stage-gallery-footer">
        <div className="archive-sticky-copy">
          <strong>{mode === "photo" ? "Фото" : "Видео"}</strong>
          <span>{mediaCount} {mediaCount === 1 ? "материал" : mediaCount < 5 ? "материала" : "материалов"} на основной сцене</span>
        </div>
        <div className="archive-action-bar">
          <Button type="button" variant="ghost" onClick={closeExpandedGallery}>
            Вернуться к дереву
          </Button>
          <Button type="button" variant="secondary" onClick={openMediaPickerOrReview}>
            {mode === "photo" ? "Загрузить фото" : "Загрузить видео"}
          </Button>
        </div>
      </div>
    );
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

  if (!isClientReady) {
    return (
      <Card className="builder-loading-state p-6" data-testid="builder-workspace-loading">
        <p className="eyebrow">Конструктор</p>
        <h2 className="card-heading">Подготавливаю рабочее пространство</h2>
        <p className="muted-copy">Схема, связи и карточки загрузятся сразу после инициализации клиента.</p>
      </Card>
    );
  }

  return (
    <>
      <div
        ref={builderLayoutRef}
        className={`builder-layout builder-layout-reworked builder-layout-canvas${isInspectorResizing ? " builder-layout-resizing" : ""}`}
        style={{ "--builder-inspector-overlay-width": `${builderInspectorWidth}px` } as CSSProperties}
      >
        <main className="builder-main">
          <Card className="viewer-stage builder-stage builder-stage-canvas">
            <div className="stage-header builder-stage-header builder-stage-header-overlay">
              <div className="stage-header-copy">
                <p className="stage-kicker">{expandedGalleryMode ? "Галерея" : "Схема дерева"}</p>
                <h2 className="card-heading">{stageTitle}</h2>
                <p className="builder-stage-note">{stageNote}</p>
              </div>
              {expandedGalleryMode ? (
                <div className="builder-stage-meta">
                  <Button type="button" variant="ghost" size="sm" onClick={closeExpandedGallery}>
                    Вернуться к дереву
                  </Button>
                </div>
              ) : null}
            </div>
            {expandedGalleryMode ? (
              <div className="builder-stage-gallery-shell">
                <PersonMediaGallery
                  media={expandedGalleryMode === "photo" ? selectedPhotoMedia : selectedVideoMedia}
                  emptyTitle={expandedGalleryMode === "photo" ? "Фотографий пока нет" : "Видео пока нет"}
                  emptyMessage={expandedGalleryMode === "photo" ? "Для этого человека пока нет фотографий." : "Для этого человека пока нет видео."}
                  avatarMediaId={expandedGalleryMode === "photo" ? selectedPrimaryPhotoMediaId : null}
                  showStickyFooter={false}
                  onSetAvatar={
                    expandedGalleryMode === "photo" && selectedPerson
                      ? (mediaId) => {
                          const currentRelation = currentSnapshotRef.current.personMedia.find(
                            (relation) => relation.person_id === selectedPerson.id && relation.media_id === mediaId
                          );
                          return savePersonAvatar(mediaId, getAvatarCropFromRelation(currentRelation)).then(() => undefined);
                        }
                      : undefined
                  }
                />
                {renderExpandedGalleryFooter(expandedGalleryMode)}
              </div>
            ) : (
              <>
                <div className="builder-canvas-shell" style={{ height: `${canvasHeight}px` }}>
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
                    personPhotoCrops={personAvatarCrops}
                    viewportHeightHint={canvasHeight}
                    onPartnershipDateChange={savePartnershipDate}
                    onNodeAction={handleCanvasAction}
                    onEmptyAction={startStandaloneCreate}
                  />
                </div>
                <button
                  type="button"
                  className="builder-canvas-resize-handle"
                  aria-label="Изменить высоту схемы"
                  onPointerDown={startCanvasResize}
                >
                  <span className="builder-canvas-resize-grip" />
                </button>
              </>
            )}
          </Card>
        </main>

        <div
          className="builder-inspector-resize-handle"
          aria-label="Изменить ширину карточки человека"
          role="separator"
          onPointerDown={(event) => {
            event.preventDefault();
            setIsInspectorResizing(true);
          }}
        />

        <Card className="builder-inspector builder-inspector-overlay utility-section-card p-6">
        <div className="builder-inspector-header utility-section-heading">
          <div className="builder-inspector-copy utility-section-heading-copy">
            <div className="builder-inspector-copy-topline">
              <div className="builder-inspector-copy-main">
                <p className="eyebrow">{createModeActive ? "Новый блок" : "Карточка человека"}</p>
                {canInlineEditInspectorName ? (
                  <div className="builder-inspector-name-row">
                    {isEditingPersonName ? (
                      <Input
                        aria-label="Имя человека"
                        className="builder-inspector-name-input"
                        value={personNameDraft}
                        onChange={(event) => setPersonNameDraft(event.target.value)}
                        onBlur={() => void commitPersonNameEdit()}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                            return;
                          }

                          if (event.key === "Escape") {
                            event.preventDefault();
                            setPersonNameDraft(selectedPerson?.full_name || "");
                            event.currentTarget.blur();
                          }
                        }}
                        autoFocus
                        required
                        suppressHydrationWarning
                      />
                    ) : (
                      <button type="button" className="builder-inspector-name-button" aria-label="Редактировать имя человека" onClick={startPersonNameEdit}>
                        <span className="card-heading builder-inspector-name-text person-card-name">{inspectorTitle}</span>
                        <Pencil className="builder-inspector-name-edit-icon" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ) : (
                  <h2 className="card-heading person-card-name">{inspectorTitle}</h2>
                )}
              </div>
              {selectedPerson && !createModeActive ? (
                <button
                  type="button"
                  className="person-summary-avatar builder-person-summary-avatar builder-person-summary-avatar-button builder-inspector-avatar builder-inspector-avatar-button"
                  aria-label={`Настроить аватар для ${selectedPerson.full_name}`}
                  onClick={() => setIsAvatarPickerOpen(true)}
                >
                  {selectedAvatarUrl ? (
                    <AvatarCropPreviewImage
                      src={selectedAvatarUrl}
                      alt={`Аватар: ${selectedPerson.full_name}`}
                      crop={selectedAvatarCrop}
                    />
                  ) : (
                    <span className="builder-inspector-avatar-fallback" aria-hidden="true">
                      {getInspectorAvatarFallback(selectedPerson.full_name)}
                    </span>
                  )}
                  <span className="builder-inspector-avatar-badge" aria-hidden="true">
                    <Camera className="builder-inspector-avatar-badge-icon" />
                  </span>
                </button>
              ) : null}
            </div>
            {inspectorDescription ? <p className="muted-copy">{inspectorDescription}</p> : null}
          </div>
          <div className="builder-inspector-tabs-row">
            <Tabs
              value={currentBuilderTab}
              onValueChange={(value) => {
                if (value === "info") {
                  setActivePanel("person");
                  return;
                }

                setMediaMode(value === "video" ? "video" : "photo");
                setActivePanel("media");
              }}
            >
              <TabsList className="builder-inspector-tabs" aria-label="Панели конструктора">
                <TabsTrigger className={currentBuilderTab === "info" ? "builder-inspector-tab builder-inspector-tab-active" : "builder-inspector-tab"} value="info">
                  Инфо
                </TabsTrigger>
                <TabsTrigger className={currentBuilderTab === "photo" ? "builder-inspector-tab builder-inspector-tab-active" : "builder-inspector-tab"} value="photo">
                  Фото
                </TabsTrigger>
                <TabsTrigger className={currentBuilderTab === "video" ? "builder-inspector-tab builder-inspector-tab-active" : "builder-inspector-tab"} value="video">
                  Видео
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {selectedPerson ? (
              <a href={buildSelectedArchiveHref(currentBuilderTab === "video" ? "video" : mediaMode === "video" ? "video" : "photo")} className={`${buttonVariants({ variant: "ghost", size: "sm" })} builder-inspector-tab-action`}>
                <ArrowUpRight aria-hidden="true" />
                Перейти в альбом
              </a>
            ) : null}
          </div>
        </div>

        {createModeActive ? (
          <div className="builder-person-summary builder-person-summary-empty utility-note-card">
            <strong>{createHeading.title}</strong>
            <span>{createContext.type === "standalone" ? "Новый блок появится отдельно, а связи можно добавить позже." : "Новый блок сразу встанет в выбранную связь."}</span>
          </div>
        ) : activePanel === "media" || selectedPerson ? null : (
          <div className="builder-person-summary builder-person-summary-empty utility-note-card">
            <strong>Выберите человека</strong>
            <span>После выбора справа откроются его данные, связи и медиа.</span>
          </div>
        )}

        {error ? <p className="form-error">{error}</p> : null}

        {activePanel === "person" ? (
          <section className="builder-panel-stack">
            {personMode === "create" ? (
              <div className="builder-section-block utility-section-card">
                <div className="builder-section-heading utility-section-heading">
                  <h3 className="card-heading">{createHeading.title}</h3>
                  <p className="muted-copy">Заполните данные человека. После сохранения новый блок появится на схеме.</p>
                </div>
                {createContext.type !== "standalone" && anchorPerson ? (
                  <div className="builder-create-context-card utility-note-card">
                    <div className="builder-create-context-copy">
                      <strong>{anchorPerson.full_name}</strong>
                      <span>Отдельный блок создается без связи. Для мгновенного добавления родственника используйте + на карточке дерева.</span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={startStandaloneCreate}>
                      Без связи
                    </Button>
                  </div>
                ) : null}
                <form
                  key={`create-${createContext.type}-${createContext.type === "standalone" ? "none" : createContext.anchorPersonId}`}
                  className="stack-form builder-form-grid"
                  onSubmit={submitCreatePerson}
                >
                  <label className="form-field builder-field-span">
                    Полное имя
                    <Input name="fullName" required placeholder="Мария Иванова" onKeyDown={handleSubmitOnEnter} />
                  </label>
                  <label className="form-field">
                    Пол
                    <BuilderGenderToggleField name="gender" />
                  </label>
                  <label className="form-field">
                    Дата рождения
                    <Input name="birthDate" type="date" />
                  </label>
                  <label className="form-field">
                    Дата смерти
                    <Input name="deathDate" type="date" />
                  </label>
                  <label className="form-field builder-field-span">
                    Био
                    <Textarea name="bio" rows={3} placeholder="Короткая биография, заметки или семейные воспоминания..." />
                  </label>
                  <Button className="builder-field-span" type="submit">
                    {createHeading.submitLabel}
                  </Button>
                </form>
              </div>
            ) : selectedPersonPending ? (
              <div className="builder-section-block utility-section-card">
                <div className="builder-section-heading utility-section-heading">
                  <h3 className="card-heading">Блок создается</h3>
                  <p className="muted-copy">Новый человек уже стоит на схеме. Дождитесь подтверждения сервера, и поля станут редактируемыми.</p>
                </div>
                <div className="builder-relation-empty">Сейчас запись создается в базе. Обычно это занимает несколько секунд.</div>
              </div>
            ) : selectedPerson ? (
              <>
                {!isSelectedRoot ? (
                  <div className="action-row builder-form-actions builder-inspector-card-actions">
                    <Button
                      className="builder-inspector-secondary-action"
                      type="button"
                      variant="ghost"
                      onClick={() => void setRootPerson(selectedPerson.id)}
                    >
                      Сделать корнем
                    </Button>
                  </div>
                ) : null}
                <form
                  key={`edit-${selectedPersonEditFormKey}`}
                  className="builder-panel-stack"
                >
                <div className="builder-inspector-meta-row" aria-label="Краткая информация о человеке">
                  <BuilderGenderToggleField
                    name="gender"
                    value={selectedPersonGenderDraft}
                    onValueChange={setSelectedPersonGenderDraft}
                    className="builder-inspector-meta-gender-group"
                    itemClassName="builder-inspector-meta-gender-item"
                    ariaLabel="Пол человека"
                    iconOnly
                    spacing={0}
                  />
                  <div className="builder-inspector-meta-dates">
                    <BuilderMetaDateField
                      name="birthDate"
                      value={selectedPersonBirthDateDraft}
                      onValueChange={setSelectedPersonBirthDateDraft}
                      ariaLabel="Дата рождения"
                    />
                    <span className="builder-inspector-meta-date-separator" aria-hidden="true">—</span>
                    <BuilderMetaDateField
                      name="deathDate"
                      value={selectedPersonDeathDateDraft}
                      onValueChange={setSelectedPersonDeathDateDraft}
                      ariaLabel="Дата смерти"
                    />
                  </div>
                </div>
                <Textarea
                  aria-label="Био"
                  className="builder-inspector-bio-textarea"
                  name="bio"
                  rows={3}
                  value={bioDraft}
                  onChange={(event) => {
                    setBioDraft(event.target.value);
                    setPersonInfoAutosaveState((currentState) => (currentState === "saved" ? "idle" : currentState));
                  }}
                  onBlur={() => {
                    void savePersonInfo(selectedPerson.id, personInfoDraftRef.current);
                  }}
                  placeholder="Краткая информация о человеке…"
                  suppressHydrationWarning
                />
                <div className="builder-inspector-bio-status-row">
                  <span
                    className="builder-inspector-bio-status"
                    role="status"
                    aria-live="polite"
                    data-state={personInfoAutosaveState}
                  >
                    {personInfoAutosaveState === "saving" ? "Сохраняется…" : personInfoAutosaveState === "saved" ? "Сохранено ✓" : ""}
                  </span>
                </div>
                </form>
              </>
            ) : (
              <div className="empty-state">Выберите человека в списке или на схеме, чтобы отредактировать его данные.</div>
            )}
          </section>
        ) : null}

        {activePanel === "person" && !createModeActive && !selectedPersonPending && selectedPerson ? (
          <section className="builder-panel-stack">
            {selectedPerson ? (
              <>
                <div className="builder-section-block builder-relations-section">
                  <div className="builder-section-heading">
                    <h3 className="card-heading">Текущие связи</h3>
                    <p className="muted-copy builder-relations-copy">
                      Нужного родственника можно открыть отсюда. Новые связи добавляются через + на карточке дерева.
                    </p>
                  </div>
                  <div className="builder-relation-board">
                    <div className="builder-relation-group">
                      <span className="builder-relation-group-title">Родители</span>
                      {selectedParentLinks.length ? (
                        selectedParentLinks.map((link) => {
                          const parent = peopleById.get(link.parent_person_id);
                          const parentName = parent?.full_name || "Неизвестный человек";
                          return (
                            <article key={link.id} className="builder-relation-row">
                              {parent ? (
                                <button type="button" className="builder-relation-link" onClick={() => focusPerson(parent.id)}>
                                  {parentName}
                                </button>
                              ) : (
                                <span className="builder-relation-link builder-relation-link-static">{parentName}</span>
                              )}
                              <button
                                type="button"
                                className="builder-relation-remove"
                                aria-label={`Удалить связь с «${parentName}»`}
                                onClick={async () => await removeParentLink(link.id)}
                              >
                                ×
                              </button>
                            </article>
                          );
                        })
                      ) : (
                        <div className="builder-relation-empty builder-relation-empty-inline">Родители не добавлены</div>
                      )}
                    </div>

                    <div className="builder-relation-group">
                      <span className="builder-relation-group-title">Дети</span>
                      {selectedChildLinks.length ? (
                        selectedChildLinks.map((link) => {
                          const child = peopleById.get(link.child_person_id);
                          const childName = child?.full_name || "Неизвестный человек";
                          return (
                            <article key={link.id} className="builder-relation-row">
                              {child ? (
                                <button type="button" className="builder-relation-link" onClick={() => focusPerson(child.id)}>
                                  {childName}
                                </button>
                              ) : (
                                <span className="builder-relation-link builder-relation-link-static">{childName}</span>
                              )}
                              <button
                                type="button"
                                className="builder-relation-remove"
                                aria-label={`Удалить связь с «${childName}»`}
                                onClick={async () => await removeParentLink(link.id)}
                              >
                                ×
                              </button>
                            </article>
                          );
                        })
                      ) : (
                        <div className="builder-relation-empty builder-relation-empty-inline">Дети не добавлены</div>
                      )}
                    </div>

                    <div className="builder-relation-group">
                      <span className="builder-relation-group-title">Партнёры</span>
                      {selectedPartnerships.length ? (
                        selectedPartnerships.map((partnership) => {
                          const partnerId = partnership.person_a_id === selectedPerson.id ? partnership.person_b_id : partnership.person_a_id;
                          const partner = peopleById.get(partnerId);
                          const partnerName = partner?.full_name || "Неизвестный человек";

                          return (
                            <article key={partnership.id} className="builder-relation-row">
                              {partner ? (
                                <button type="button" className="builder-relation-link" onClick={() => focusPerson(partner.id)}>
                                  {partnerName}
                                </button>
                              ) : (
                                <span className="builder-relation-link builder-relation-link-static">{partnerName}</span>
                              )}
                              <button
                                type="button"
                                className="builder-relation-remove"
                                aria-label={`Удалить связь с «${partnerName}»`}
                                onClick={async () => await removePartnership(partnership.id)}
                              >
                                ×
                              </button>
                            </article>
                          );
                        })
                      ) : (
                        <div className="builder-relation-empty builder-relation-empty-inline">Партнёры не добавлены</div>
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

        {activePanel === "person" && !createModeActive && !selectedPersonPending && selectedPerson ? (
          <section className="builder-panel-stack">
            <div className="builder-section-block builder-relations-section builder-documents-section">
              <div className="builder-block-heading">
                <strong>Документы</strong>
              </div>
              <input
                id="builder-media-file-input"
                ref={mediaFileInputRef}
                className="builder-native-file-input"
                name="mediaFile"
                type="file"
                accept={activeUploadConfig.accept}
                multiple
                disabled={isUploadingMedia}
                aria-label="Документы"
                onChange={handleMediaFileSelection}
              />
              <Button
                type="button"
                variant="secondary"
                className="builder-documents-upload-button"
                disabled={isUploadingMedia}
                onClick={openMediaPickerOrReview}
              >
                Загрузить файл
              </Button>
              <p className="builder-media-limits-note builder-documents-limits-note">
                До {MAX_MEDIA_FILES_PER_BATCH} файлов, до {formatMediaUploadBytes(getBuilderUploadScopeFileSizeLimit("document"))} на файл.
              </p>
              <div className="builder-relation-board">
                {selectedDocumentMedia.length ? (
                  selectedDocumentMedia.map((asset) => (
                    <article key={asset.id} className="builder-relation-row">
                      <a href={buildMediaOpenRouteUrl(asset)} target="_blank" rel="noreferrer" className="builder-relation-link">
                        {asset.title}
                      </a>
                      <button
                        type="button"
                        className="builder-relation-remove"
                        aria-label={`Удалить документ «${asset.title}»`}
                        onClick={async () => await submitJson(`/api/media/${asset.id}`, "DELETE", {})}
                      >
                        ×
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="builder-relation-empty builder-relation-empty-inline">Документы не добавлены</div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activePanel === "media" ? (
          <section className="builder-panel-stack">
            {selectedPerson ? (
              <>
                {currentBuilderTab === "photo" ? (
                  <>
                    <div className="builder-section-block builder-media-tab-section">
                      <input
                        id="builder-media-file-input"
                        ref={mediaFileInputRef}
                        className="builder-native-file-input"
                        name="mediaFile"
                        type="file"
                        accept={activeUploadConfig.accept}
                        multiple
                        disabled={isUploadingMedia}
                        aria-label="Фотографии с устройства"
                        onChange={handleMediaFileSelection}
                      />
                      {canDeleteSelectedPhotoMedia && selectedPhotoMediaCount ? (
                        <div className="builder-media-selection-bar" role="region" aria-label="Действия с выбранными фотографиями">
                          <div className="builder-media-selection-copy">
                            <strong>Выбрано: {selectedPhotoMediaCount}</strong>
                            <span>{selectedPhotoMediaCount} {selectedPhotoMediaCount === 1 ? "фото" : "фото"} готово к удалению.</span>
                          </div>
                          <div className="archive-action-bar builder-media-selection-actions">
                            <Button type="button" disabled={isBulkPhotoDeleting} onClick={() => setIsBulkPhotoDeleteConfirmOpen(true)}>
                              {isBulkPhotoDeleting ? "Удаляю..." : "Удалить"}
                            </Button>
                            <Button type="button" variant="ghost" disabled={isBulkPhotoDeleting} onClick={clearSelectedPhotoMedia}>
                              Отмена
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <PersonMediaGallery
                        media={selectedPhotoMedia}
                        emptyTitle="Фотографий пока нет"
                        emptyMessage="Для этого человека пока нет фотографий."
                        avatarMediaId={selectedPrimaryPhotoMediaId}
                        canDeleteMedia={canDeleteSelectedPhotoMedia}
                        showInlineMediaActions
                        canManageInlineMediaActions={canDeleteSelectedPhotoMedia}
                        getInlineMediaAlbumHref={buildPhotoArchiveHrefForMedia}
                        selectionMode={isPhotoSelectionMode}
                        canSelectMedia={canDeleteSelectedPhotoMedia}
                        selectedMediaIds={selectedPhotoMediaIds}
                        showStickyFooter={false}
                        showStage={false}
                        showViewerAvatarAction
                        appendTile={renderPhotoAddTile()}
                        onStartMediaSelection={startPhotoSelectionMode}
                        onToggleMediaSelection={toggleSelectedPhotoMedia}
                        onDeleteMedia={(mediaId) => deleteBuilderPhoto(mediaId)}
                        onSetAvatar={(mediaId) => {
                          const currentRelation = currentSnapshotRef.current.personMedia.find(
                            (relation) => relation.person_id === selectedPerson.id && relation.media_id === mediaId
                          );
                          return savePersonAvatar(mediaId, getAvatarCropFromRelation(currentRelation)).then(() => undefined);
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="builder-section-block builder-media-tab-section">
                      <input
                        id="builder-media-file-input"
                        ref={mediaFileInputRef}
                        className="builder-native-file-input"
                        name="mediaFile"
                        type="file"
                        accept={activeUploadConfig.accept}
                        multiple
                        disabled={isUploadingMedia}
                        aria-label="Видео с устройства"
                        onChange={handleMediaFileSelection}
                      />
                      <PersonMediaGallery
                        media={selectedVideoMedia}
                        emptyTitle="Видео пока нет"
                        emptyMessage="Для этого человека пока нет видео."
                        showStickyFooter={false}
                        showStage={false}
                        appendTile={renderVideoAddTile()}
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="empty-state">Сначала выберите человека, чтобы открыть его фото или видео как отдельные галереи.</div>
            )}
          </section>
        ) : null}
        </Card>
      </div>

      {selectedPerson && !createModeActive ? (
        <BuilderAvatarPickerDialog
          open={isAvatarPickerOpen}
          personName={selectedPerson.full_name}
          photos={selectedPhotoMedia}
          currentAvatarMediaId={selectedPrimaryPhotoMediaId}
          currentAvatarCrop={selectedAvatarCrop}
          onOpenChange={setIsAvatarPickerOpen}
          onJumpToPhotos={switchToPhotoTab}
          onSave={savePersonAvatar}
        />
      ) : null}

      <Dialog open={isMediaUploadReviewOpen} onOpenChange={(open) => (!open ? requestCloseMediaUploadReview() : null)}>
        <DialogContent className="archive-dialog" aria-label="Проверка файлов перед загрузкой" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Проверка файлов перед загрузкой</DialogTitle>
            <DialogDescription>
              {selectedPerson
                ? `Файлы будут привязаны к карточке «${selectedPerson.full_name}».`
                : "Файлы будут привязаны к выбранной карточке."}
            </DialogDescription>
          </DialogHeader>
          <div className="archive-review-layout">
            <div className="archive-review-summary" aria-label="Сводка выбранных файлов">
              {pendingMediaUploadsSummary}
            </div>
            <div className="archive-review-metadata">
              <label className="form-field">
                Видимость
                <SelectField value={reviewMediaVisibility} onChange={(event) => setReviewMediaVisibility(event.target.value as "public" | "members")} disabled={isUploadingMedia}>
                  <option value="public">Всем по ссылке</option>
                  <option value="members">Только членам семьи</option>
                </SelectField>
              </label>
              <label className="form-field">
                Подпись
                <Textarea
                  rows={1}
                  className="min-h-11"
                  value={reviewMediaCaption}
                  onChange={(event) => setReviewMediaCaption(event.target.value)}
                  placeholder="Общая подпись для выбранных файлов, если она нужна"
                  disabled={isUploadingMedia}
                />
              </label>
            </div>
            <div className="archive-review-body">
              <div className={`archive-grid archive-review-grid${pendingMediaUploads.length > 12 ? " archive-review-grid-dense" : ""}`}>
                {pendingMediaUploads.map((item) => (
                  <article key={item.id} className="archive-review-tile">
                    <button
                      type="button"
                      className="archive-remove-button"
                      aria-label={`Убрать файл ${item.file.name}`}
                      onClick={() => removePendingMediaUpload(item.id)}
                    >
                      ×
                    </button>
                    {item.previewUrl && item.file.type.startsWith("video/") ? (
                      <video src={item.previewUrl} className="archive-tile-video" muted playsInline preload="metadata" />
                    ) : item.previewUrl ? (
                      <img src={item.previewUrl} alt="" className="archive-tile-image" />
                    ) : (
                      <div className={`archive-tile-placeholder${item.file.type.startsWith("video/") ? " archive-tile-placeholder-video" : ""}`}>
                        <span>{item.file.type.startsWith("video/") ? "▶" : "DOC"}</span>
                      </div>
                    )}
                    <div className="archive-review-tile-copy">
                      <span>{getBuilderPendingUploadKindLabel(item.file)} • {formatBuilderReviewFileSize(item.file.size)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="archive-review-footer archive-actions">
            <input
              ref={reviewMediaFileInputRef}
              className="builder-native-file-input"
              type="file"
              multiple
              accept={activeUploadConfig.accept}
              disabled={isUploadingMedia}
              onChange={handleReviewMediaFileSelection}
            />
            <Button type="button" variant="secondary" disabled={isUploadingMedia} onClick={() => reviewMediaFileInputRef.current?.click()}>
              Добавить еще
            </Button>
            <Button type="button" variant="outline" disabled={isUploadingMedia} onClick={hideMediaUploadReview}>
              Обратно
            </Button>
            <Button type="button" variant="outline" disabled={isUploadingMedia} onClick={requestCloseMediaUploadReview}>
              Отмена
            </Button>
            <Button type="button" disabled={isUploadingMedia} onClick={() => void savePendingMediaUploads()}>
              Сохранить {pendingMediaUploads.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMediaUploadDiscardConfirmOpen} onOpenChange={setIsMediaUploadDiscardConfirmOpen}>
        <DialogContent className="archive-confirm-dialog" aria-label="Сбросить выбранные файлы" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Сбросить выбранные файлы</DialogTitle>
            <DialogDescription>Файлы уже выбраны, но еще не сохранены. Если закрыть окно сейчас, набор придется собирать заново.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="archive-actions">
            <Button type="button" variant="ghost" onClick={() => setIsMediaUploadDiscardConfirmOpen(false)}>
              Вернуться
            </Button>
            <Button type="button" onClick={discardPendingMediaUploads}>
              Сбросить набор
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isBulkPhotoDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isBulkPhotoDeleting) {
            setIsBulkPhotoDeleteConfirmOpen(false);
          }
        }}
      >
        <DialogContent className="archive-confirm-dialog" aria-label="Удалить выбранные фото?" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Удалить выбранные фото?</DialogTitle>
            <DialogDescription>
              {selectedPhotoMediaCount ? `${selectedPhotoMediaCount} шт. будут удалены без перезагрузки страницы.` : "Выбранные фото будут удалены без перезагрузки страницы."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="archive-actions">
            <Button type="button" variant="ghost" disabled={isBulkPhotoDeleting} onClick={() => setIsBulkPhotoDeleteConfirmOpen(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={isBulkPhotoDeleting} onClick={() => void deleteSelectedBuilderPhotos()}>
              {isBulkPhotoDeleting ? "Удаляю..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {status ? (
        <div className="builder-status-toast" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
    </>
  );
}
