import { toErrorResponse } from "@/lib/server/errors";
import { createParentLink } from "@/lib/server/repository";
import { parentLinkSchema } from "@/lib/validators/relationship";

export async function POST(request: Request) {
  try {
    const payload = parentLinkSchema.parse(await request.json());
    const link = await createParentLink(payload);
    return Response.json({ link, message: "Связь родитель-ребенок добавлена." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

