import { z } from "zod";

const mediaVisibilitySchema = z.enum(["public", "members"]);
const mediaUploadBaseSchema = {
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
  mediaId: z.string().uuid(),
  visibility: mediaVisibilitySchema,
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().max(400).optional().or(z.literal(""))
} as const;

export const photoUploadSchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
  filename: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(3).max(120),
  visibility: mediaVisibilitySchema,
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().max(400).optional().or(z.literal(""))
});

export const completePhotoSchema = z.object({
  ...mediaUploadBaseSchema,
  storagePath: z.string().trim().min(1),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().optional()
});

export const mediaUploadIntentSchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
  filename: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(3).max(120),
  visibility: mediaVisibilitySchema,
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().max(400).optional().or(z.literal(""))
});

export const completeMediaSchema = z.object({
  ...mediaUploadBaseSchema,
  storagePath: z.string().trim().min(1),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().optional(),
  provider: z.literal("supabase_storage").optional()
}).or(
  z.object({
    ...mediaUploadBaseSchema,
    provider: z.literal("yandex_disk"),
    externalUrl: z.string().trim().url().max(2000)
  })
);

