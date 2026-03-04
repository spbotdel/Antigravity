import { toErrorResponse } from "@/lib/server/errors";
import { createInvite } from "@/lib/server/repository";
import { inviteSchema } from "@/lib/validators/invite";

export async function POST(request: Request) {
  try {
    const payload = inviteSchema.parse(await request.json());
    const result = await createInvite(payload);
    return Response.json({ ...result, message: "Приглашение создано." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

