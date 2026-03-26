"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyAvatarCropDrag, buildAvatarHtmlImageStyle, DEFAULT_AVATAR_CROP, normalizeAvatarCrop } from "@/lib/avatar-crop";
import { buildPhotoPreviewRouteUrl } from "@/lib/tree/display";
import type { AvatarCropValue, MediaAssetRecord } from "@/lib/types";

interface AvatarCropPreviewImageProps {
  src: string;
  alt: string;
  crop: AvatarCropValue;
  className?: string;
  imageClassName?: string;
}

interface BuilderAvatarPickerDialogProps {
  open: boolean;
  personName: string;
  photos: MediaAssetRecord[];
  currentAvatarMediaId?: string | null;
  currentAvatarCrop?: AvatarCropValue | null;
  onJumpToPhotos: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: (mediaId: string, crop: AvatarCropValue) => Promise<boolean | void>;
}

type BuilderAvatarPickerStep = "empty" | "select" | "crop";
const AVATAR_CROP_WHEEL_STEP = 0.05;

function joinClassNames(...values: Array<string | null | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function AvatarCropPreviewImage({
  src,
  alt,
  crop,
  className,
  imageClassName
}: AvatarCropPreviewImageProps) {
  const imageStyle = buildAvatarHtmlImageStyle(crop);

  return (
    <span className={joinClassNames("builder-avatar-preview-surface", className)}>
      <img
        src={src}
        alt={alt}
        className={joinClassNames("builder-avatar-preview-image", imageClassName)}
        style={imageStyle}
        draggable={false}
      />
    </span>
  );
}

export function BuilderAvatarPickerDialog({
  open,
  personName,
  photos,
  currentAvatarMediaId = null,
  currentAvatarCrop = null,
  onJumpToPhotos,
  onOpenChange,
  onSave
}: BuilderAvatarPickerDialogProps) {
  const [step, setStep] = useState<BuilderAvatarPickerStep>("empty");
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [draftCrop, setDraftCrop] = useState<AvatarCropValue>(DEFAULT_AVATAR_CROP);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    crop: AvatarCropValue;
  } | null>(null);

  const selectedPhoto = useMemo(
    () => photos.find((photo) => photo.id === selectedMediaId) || null,
    [photos, selectedMediaId]
  );
  const selectedPhotoUrl = selectedPhoto ? buildPhotoPreviewRouteUrl(selectedPhoto, "thumb") : null;

  useEffect(() => {
    if (!open) {
      setIsSaving(false);
      setIsDraggingCrop(false);
      dragStateRef.current = null;
      return;
    }

    if (!photos.length) {
      setStep("empty");
      setSelectedMediaId(null);
      setDraftCrop(DEFAULT_AVATAR_CROP);
      return;
    }

    const initialMediaId =
      currentAvatarMediaId && photos.some((photo) => photo.id === currentAvatarMediaId)
        ? currentAvatarMediaId
        : photos[0].id;
    const initialCrop =
      currentAvatarMediaId && initialMediaId === currentAvatarMediaId
        ? normalizeAvatarCrop(currentAvatarCrop)
        : DEFAULT_AVATAR_CROP;

    setSelectedMediaId(initialMediaId);
    setDraftCrop(initialCrop);
    setStep(photos.length === 1 ? "crop" : "select");
  }, [currentAvatarCrop, currentAvatarMediaId, open, photos]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;
      const stage = cropStageRef.current;
      if (!dragState || !stage) {
        return;
      }

      const viewportSizePx = stage.getBoundingClientRect().width;
      setDraftCrop(
        applyAvatarCropDrag(
          dragState.crop,
          event.clientX - dragState.startX,
          event.clientY - dragState.startY,
          viewportSizePx
        )
      );
    }

    function clearDragState() {
      dragStateRef.current = null;
      setIsDraggingCrop(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", clearDragState);
    window.addEventListener("pointercancel", clearDragState);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", clearDragState);
      window.removeEventListener("pointercancel", clearDragState);
    };
  }, [open]);

  function handleCropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const stage = cropStageRef.current;
    if (!stage) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      crop: draftCrop
    };
    setIsDraggingCrop(true);
    event.preventDefault();
  }

  function handleCropWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    const zoomDeltaSteps =
      event.deltaMode === 1
        ? event.deltaY
        : event.deltaMode === 2
          ? event.deltaY * 3
          : event.deltaY / 100;

    const nextZoom = draftCrop.zoom - zoomDeltaSteps * AVATAR_CROP_WHEEL_STEP;
    setDraftCrop((current) =>
      normalizeAvatarCrop({
        ...current,
        zoom: nextZoom
      })
    );
  }

  function openCropStep(mediaId: string) {
    setSelectedMediaId(mediaId);
    setDraftCrop(mediaId === currentAvatarMediaId ? normalizeAvatarCrop(currentAvatarCrop) : DEFAULT_AVATAR_CROP);
    setStep("crop");
  }

  async function handleSave() {
    if (!selectedMediaId) {
      return;
    }

    setIsSaving(true);
    try {
      const completed = await onSave(selectedMediaId, draftCrop);
      if (completed !== false) {
        onOpenChange(false);
      }
    } finally {
      setIsSaving(false);
      }
    }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="builder-avatar-dialog"
        aria-label={`Настроить аватар: ${personName}`}
        style={{
          maxHeight: "min(820px, calc(100vh - 24px))",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          overflow: "hidden"
        }}
      >
        <DialogHeader>
          <DialogTitle>Аватар</DialogTitle>
          <DialogDescription>
            {step === "crop"
              ? "Выберите квадратный кадр для аватара. В MVP можно только подвигать фото и немного приблизить его."
              : "Выберите фотографию, которая будет использоваться как аватар в карточке и на схеме."}
          </DialogDescription>
        </DialogHeader>

        {step === "empty" ? (
          <div className="builder-avatar-empty-state">
            <div className="empty-state-copy">
              <strong>Сначала добавьте фото</strong>
              <p>Для аватара можно выбрать только уже загруженные фотографии этого человека.</p>
            </div>
            <div className="action-row">
              <Button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onJumpToPhotos();
                }}
              >
                Перейти во вкладку Фото
              </Button>
            </div>
          </div>
        ) : null}

        {step === "select" ? (
          <div
            className="builder-avatar-grid"
            style={{
              minHeight: 0,
              alignContent: "start",
              overflowY: "auto",
              paddingRight: "4px"
            }}
          >
            {photos.map((photo) => {
              const previewUrl = buildPhotoPreviewRouteUrl(photo, "thumb");
              const isCurrentAvatar = photo.id === currentAvatarMediaId;
              const isSelected = photo.id === selectedMediaId;

              return (
                <button
                  key={photo.id}
                  type="button"
                  className={joinClassNames(
                    "builder-avatar-tile",
                    isSelected && "builder-avatar-tile-active"
                  )}
                  onClick={() => openCropStep(photo.id)}
                >
                  <AvatarCropPreviewImage
                    src={previewUrl}
                    alt=""
                    crop={photo.id === currentAvatarMediaId ? normalizeAvatarCrop(currentAvatarCrop) : DEFAULT_AVATAR_CROP}
                    className="builder-avatar-tile-visual"
                  />
                  <span className="builder-avatar-tile-copy">
                    <strong>{photo.title}</strong>
                    <span>{isCurrentAvatar ? "Текущий аватар" : "Открыть кадрирование"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {step === "crop" && selectedPhoto && selectedPhotoUrl ? (
          <div className="builder-avatar-crop-layout">
            <div
              ref={cropStageRef}
              className="builder-avatar-crop-stage"
              data-dragging={isDraggingCrop ? "true" : "false"}
              onPointerDown={handleCropPointerDown}
              onWheel={handleCropWheel}
            >
              <AvatarCropPreviewImage
                src={selectedPhotoUrl}
                alt={`Аватар: ${personName}`}
                crop={draftCrop}
                className="builder-avatar-crop-stage-visual"
              />
            </div>

            <div className="builder-avatar-crop-controls">
              <div className="builder-avatar-crop-copy">
                <strong>{selectedPhoto.title}</strong>
                <span>Потяните фото в квадрате и при необходимости увеличьте его.</span>
              </div>
              <label className="builder-avatar-zoom-field">
                Масштаб
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={draftCrop.zoom}
                  onChange={(event) => {
                    const nextZoom = Number(event.currentTarget.value);
                    setDraftCrop((current) =>
                      normalizeAvatarCrop({
                        ...current,
                        zoom: nextZoom
                      })
                    );
                  }}
                />
              </label>
            </div>
          </div>
        ) : null}

        <DialogFooter className="builder-avatar-dialog-footer">
          {step === "crop" && photos.length > 1 ? (
            <Button type="button" variant="ghost" onClick={() => setStep("select")} disabled={isSaving}>
              Назад
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Отмена
          </Button>
          {step === "crop" ? (
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving || !selectedMediaId}>
              {isSaving ? "Сохраняю..." : "Сохранить"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
