import { createTreeSchema } from "@/lib/validators/tree";
import { createTreeForOwner } from "@/lib/server/repository";
import { toErrorResponse } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const payload = createTreeSchema.parse(await request.json());
    const tree = await createTreeForOwner(payload);
    return Response.json({ tree, message: "Дерево создано." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

