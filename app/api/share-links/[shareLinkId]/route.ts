import { toErrorResponse } from "@/lib/server/errors";
import { revokeShareLink } from "@/lib/server/repository";

interface Params {
  params: Promise<{ shareLinkId: string }>;
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { shareLinkId } = await params;
    const shareLink = await revokeShareLink(shareLinkId);
    return Response.json({ shareLink, message: "Семейная ссылка отозвана." });
  } catch (error) {
    return toErrorResponse(error);
  }
}
