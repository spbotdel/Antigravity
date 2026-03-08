import sharp from "sharp";

import { toErrorResponse } from "@/lib/server/errors";
import { uploadFileToSignedUrl } from "@/lib/server/repository";

const MAX_MEDIA_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const PHOTO_VARIANT_SPECS = {
  thumb: { width: 240, height: 240, fit: "cover" as const, quality: 72 },
  small: { width: 960, height: 960, fit: "inside" as const, quality: 78 },
  medium: { width: 1600, height: 1600, fit: "inside" as const, quality: 82 }
};

interface VariantUploadTarget {
  variant: "thumb" | "small" | "medium";
  signedUrl: string;
  path: string;
}

function parseVariantTargets(rawValue: FormDataEntryValue | null): VariantUploadTarget[] {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return [];
  }

  const parsed = JSON.parse(rawValue);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is VariantUploadTarget => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const variant = "variant" in item ? item.variant : null;
    const signedUrl = "signedUrl" in item ? item.signedUrl : null;
    const path = "path" in item ? item.path : null;

    return (
      (variant === "thumb" || variant === "small" || variant === "medium")
      && typeof signedUrl === "string"
      && typeof path === "string"
    );
  });
}

async function buildPhotoVariantBuffers(fileBuffer: Buffer, variantTargets: VariantUploadTarget[]) {
  const variantBuffers: Array<{ target: VariantUploadTarget; buffer: Buffer }> = [];

  for (const target of variantTargets) {
    const spec = PHOTO_VARIANT_SPECS[target.variant];
    const buffer = await sharp(fileBuffer)
      .rotate()
      .resize({
        width: spec.width,
        height: spec.height,
        fit: spec.fit,
        withoutEnlargement: true
      })
      .webp({ quality: spec.quality })
      .toBuffer();

    variantBuffers.push({ target, buffer });
  }

  return variantBuffers;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const signedUrl = String(formData.get("signedUrl") || "").trim();
    const contentType = String(formData.get("contentType") || "").trim() || undefined;
    const file = formData.get("file");
    const variantTargets = parseVariantTargets(formData.get("variantTargets"));

    if (!signedUrl) {
      return Response.json({ error: "Не передан signed URL для загрузки." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return Response.json({ error: "Файл для загрузки не найден." }, { status: 400 });
    }

    if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
      return Response.json(
        {
          error: `Размер файла превышает ${Math.round(MAX_MEDIA_FILE_SIZE_BYTES / (1024 * 1024))} МБ.`
        },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await uploadFileToSignedUrl({
      signedUrl,
      contentType,
      fileBuffer
    });

    if (variantTargets.length && file.type.startsWith("image/")) {
      const variantBuffers = await buildPhotoVariantBuffers(fileBuffer, variantTargets);
      for (const item of variantBuffers) {
        await uploadFileToSignedUrl({
          signedUrl: item.target.signedUrl,
          contentType: "image/webp",
          fileBuffer: item.buffer
        });
      }
    }

    return Response.json({ message: "Файл загружен в storage." });
  } catch (error) {
    return toErrorResponse(error);
  }
}
