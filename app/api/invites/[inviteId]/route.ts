import { toErrorResponse } from "@/lib/server/errors";
import { revokeInvite } from "@/lib/server/repository";

interface Params {
  params: Promise<{ inviteId: string }>;
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { inviteId } = await params;
    await revokeInvite(inviteId);
    return Response.json({ message: "Приглашение отозвано." });
  } catch (error) {
    return toErrorResponse(error);
  }
}
