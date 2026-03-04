import { toErrorResponse } from "@/lib/server/errors";
import { createPartnership } from "@/lib/server/repository";
import { partnershipSchema } from "@/lib/validators/relationship";

export async function POST(request: Request) {
  try {
    const payload = partnershipSchema.parse(await request.json());
    const partnership = await createPartnership(payload);
    return Response.json({ partnership, message: "Пара добавлена." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

