import { visibilitySchema } from "@/lib/validators/tree";
import { toErrorResponse } from "@/lib/server/errors";
import { updateTreeVisibility } from "@/lib/server/repository";

interface Params {
  params: Promise<{ treeId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { treeId } = await params;
    const payload = visibilitySchema.parse(await request.json());
    const tree = await updateTreeVisibility(treeId, payload.visibility);
    return Response.json({ tree, message: "Видимость дерева обновлена." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

