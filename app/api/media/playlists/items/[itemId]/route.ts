import { toErrorResponse } from "@/lib/server/errors";
import { removeAudioMediaFromTreeAudioPlaylistItem } from "@/lib/server/repository";

interface Params {
  params: Promise<{ itemId: string }>;
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { itemId } = await params;
    const result = await removeAudioMediaFromTreeAudioPlaylistItem(itemId);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
