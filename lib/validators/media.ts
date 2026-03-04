import { z } from "zod";

export const photoUploadSchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
  filename: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(3).max(120),
  visibility: z.enum(["public", "members"]),
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().max(400).optional().or(z.literal(""))
});

export const completePhotoSchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
  mediaId: z.string().uuid(),
  storagePath: z.string().trim().min(1),
  visibility: z.enum(["public", "members"]),
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().max(400).optional().or(z.literal("")),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().optional()
});

export const videoSchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().max(400).optional().or(z.literal("")),
  externalUrl: z.string().url().refine((value) => /yandex/i.test(value), "В версии v1 разрешены только ссылки Яндекс Диска")
});

