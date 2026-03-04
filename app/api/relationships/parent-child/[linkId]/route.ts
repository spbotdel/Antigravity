import { toErrorResponse } from "@/lib/server/errors";
import { deleteParentLink } from "@/lib/server/repository";

interface Params {
  params: Promise<{ linkId: string }>;
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { linkId } = await params;
    await deleteParentLink(linkId);
    return Response.json({ message: "Связь родитель-ребенок удалена." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

