import { toErrorResponse } from "@/lib/server/errors";
import { revealShareLink, revokeShareLink } from "@/lib/server/repository";

interface Params {
  params: Promise<{ shareLinkId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { shareLinkId } = await params;
    const result = await revealShareLink(shareLinkId, new URL(request.url).origin);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
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
