import { z } from "zod";

export const inviteSchema = z.object({
  treeId: z.string().uuid(),
  role: z.enum(["admin", "viewer"]),
  inviteMethod: z.enum(["link", "email"]),
  email: z.string().email().optional().or(z.literal("")),
  expiresInDays: z.number().int().min(1).max(30).default(7)
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10)
});
