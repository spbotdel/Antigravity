import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createTreeSchema = z.object({
  title: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(3).max(80).regex(slugRegex),
  description: z.string().trim().max(500).optional().or(z.literal(""))
});

export const updateTreeSchema = createTreeSchema.partial().extend({
  rootPersonId: z.string().uuid().nullable().optional()
});

export const visibilitySchema = z.object({
  visibility: z.enum(["public", "private"])
});
