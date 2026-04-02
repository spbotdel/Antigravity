import { toErrorResponse } from "@/lib/server/errors";
import { deleteTreeAudioPlaylist } from "@/lib/server/repository";

interface Params {
  params: Promise<{ playlistId: string }>;
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { playlistId } = await params;
    await deleteTreeAudioPlaylist(playlistId);
    return Response.json({ message: "Плейлист удален." });
  } catch (error) {
    return toErrorResponse(error);
  }
}
