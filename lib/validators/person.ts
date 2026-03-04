import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const personGender = z.enum(["female", "male", "other"]);

export const personSchema = z.object({
  treeId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(160),
  gender: personGender.nullable().optional(),
  birthDate: isoDate.nullable().optional(),
  deathDate: isoDate.nullable().optional(),
  birthPlace: z.string().trim().max(160).nullable().optional(),
  deathPlace: z.string().trim().max(160).nullable().optional(),
  bio: z.string().trim().max(4000).nullable().optional(),
  isLiving: z.boolean().default(true)
});

export const personUpdateSchema = personSchema.partial().extend({
  treeId: z.string().uuid().optional()
});
