import { updateTreeSchema } from "@/lib/validators/tree";
import { toErrorResponse } from "@/lib/server/errors";
import { updateTree } from "@/lib/server/repository";

interface Params {
  params: Promise<{ treeId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { treeId } = await params;
    const payload = updateTreeSchema.parse(await request.json());
    const tree = await updateTree(treeId, payload);
    return Response.json({ tree, message: "Данные дерева обновлены." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

