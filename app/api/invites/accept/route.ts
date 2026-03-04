import { toErrorResponse } from "@/lib/server/errors";
import { acceptInvite } from "@/lib/server/repository";
import { acceptInviteSchema } from "@/lib/validators/invite";

export async function POST(request: Request) {
  try {
    const payload = acceptInviteSchema.parse(await request.json());
    const tree = await acceptInvite(payload.token);
    return Response.json({ slug: tree.slug, message: "Приглашение принято." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

