import type { AvatarCropValue, PersonMediaRecord, TreeSnapshot } from "@/lib/types";

export const AVATAR_CROP_MIN_ZOOM = 1;
export const AVATAR_CROP_MAX_ZOOM = 3;
export const DEFAULT_AVATAR_CROP: AvatarCropValue = {
  x: 0.5,
  y: 0.5,
  zoom: 1
};

export interface AvatarCropLayout {
  crop: AvatarCropValue;
  imageX: number;
  imageY: number;
  imageSize: number;
}

type AvatarCropInput = Partial<AvatarCropValue> | null | undefined;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCenterBounds(zoom: number) {
  const inset = 0.5 / zoom;
  return {
    min: inset,
    max: 1 - inset
  };
}

export function normalizeAvatarCrop(input?: AvatarCropInput): AvatarCropValue {
  const zoom = clamp(
    Number.isFinite(input?.zoom) ? Number(input?.zoom) : DEFAULT_AVATAR_CROP.zoom,
    AVATAR_CROP_MIN_ZOOM,
    AVATAR_CROP_MAX_ZOOM
  );
  const bounds = getCenterBounds(zoom);
  return {
    x: clamp(Number.isFinite(input?.x) ? Number(input?.x) : DEFAULT_AVATAR_CROP.x, bounds.min, bounds.max),
    y: clamp(Number.isFinite(input?.y) ? Number(input?.y) : DEFAULT_AVATAR_CROP.y, bounds.min, bounds.max),
    zoom
  };
}

export function resolveAvatarCropLayout(input?: AvatarCropInput): AvatarCropLayout {
  const crop = normalizeAvatarCrop(input);
  const imageSize = crop.zoom;
  return {
    crop,
    imageX: 0.5 - crop.x * imageSize,
    imageY: 0.5 - crop.y * imageSize,
    imageSize
  };
}

export function buildAvatarHtmlImageStyle(input?: AvatarCropInput) {
  const layout = resolveAvatarCropLayout(input);
  return {
    left: `${layout.imageX * 100}%`,
    top: `${layout.imageY * 100}%`,
    width: `${layout.imageSize * 100}%`,
    height: `${layout.imageSize * 100}%`
  };
}

export function buildAvatarSvgImageAttrs(input?: AvatarCropInput) {
  const layout = resolveAvatarCropLayout(input);
  return {
    x: layout.imageX,
    y: layout.imageY,
    width: layout.imageSize,
    height: layout.imageSize
  };
}

export function applyAvatarCropDrag(input: AvatarCropInput, deltaX: number, deltaY: number, viewportSizePx: number) {
  const crop = normalizeAvatarCrop(input);
  if (!Number.isFinite(viewportSizePx) || viewportSizePx <= 0) {
    return crop;
  }

  return normalizeAvatarCrop({
    x: crop.x - deltaX / (viewportSizePx * crop.zoom),
    y: crop.y - deltaY / (viewportSizePx * crop.zoom),
    zoom: crop.zoom
  });
}

export function getAvatarCropFromRelation(relation?: Pick<PersonMediaRecord, "avatar_crop_x" | "avatar_crop_y" | "avatar_crop_zoom"> | null) {
  return normalizeAvatarCrop({
    x: relation?.avatar_crop_x ?? undefined,
    y: relation?.avatar_crop_y ?? undefined,
    zoom: relation?.avatar_crop_zoom ?? undefined
  });
}

export function buildPrimaryPersonAvatarCrops(snapshot: Pick<TreeSnapshot, "media" | "personMedia">) {
  const photoMediaIds = new Set(snapshot.media.filter((asset) => asset.kind === "photo").map((asset) => asset.id));
  const sortedRelations = [...snapshot.personMedia].sort((left, right) => Number(right.is_primary) - Number(left.is_primary));
  const result: Record<string, AvatarCropValue> = {};

  for (const relation of sortedRelations) {
    if (result[relation.person_id]) {
      continue;
    }

    if (!photoMediaIds.has(relation.media_id)) {
      continue;
    }

    result[relation.person_id] = getAvatarCropFromRelation(relation);
  }

  return result;
}
