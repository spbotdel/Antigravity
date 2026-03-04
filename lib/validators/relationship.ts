import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const parentLinkSchema = z.object({
  treeId: z.string().uuid(),
  parentPersonId: z.string().uuid(),
  childPersonId: z.string().uuid(),
  relationType: z.string().trim().min(2).max(50).default("biological")
});

export const partnershipSchema = z.object({
  treeId: z.string().uuid(),
  personAId: z.string().uuid(),
  personBId: z.string().uuid(),
  status: z.string().trim().min(2).max(50).default("married"),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional()
});
