import { z } from "zod";

export const createShareLinkSchema = z.object({
  treeId: z.string().uuid(),
  treeSlug: z.string().trim().min(1).max(200).optional().or(z.literal("")),
  label: z.string().trim().max(120).optional().or(z.literal("")),
  expiresInDays: z.number().int().min(1).max(30).default(14)
});

export const listShareLinksQuerySchema = z.object({
  treeId: z.string().uuid()
});
