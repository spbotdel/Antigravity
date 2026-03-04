import { z } from "zod";

import { toErrorResponse } from "@/lib/server/errors";
import { revokeMembership, updateMembershipRole } from "@/lib/server/repository";

interface Params {
  params: Promise<{ membershipId: string }>;
}

const membershipRoleSchema = z.object({
  role: z.enum(["owner", "admin", "viewer"])
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { membershipId } = await params;
    const payload = membershipRoleSchema.parse(await request.json());
    const membership = await updateMembershipRole(membershipId, payload.role);
    return Response.json({ membership, message: "Роль участника обновлена." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { membershipId } = await params;
    await revokeMembership(membershipId);
    return Response.json({ message: "Доступ участника отозван." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

