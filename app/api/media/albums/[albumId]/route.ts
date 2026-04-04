import { toErrorResponse } from "@/lib/server/errors";
import { deleteTreeMediaAlbum, updateTreeMediaAlbum } from "@/lib/server/repository";
import { updateTreeMediaAlbumSchema } from "@/lib/validators/media";

interface Params {
  params: Promise<{ albumId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { albumId } = await params;
    const payload = updateTreeMediaAlbumSchema.parse(await request.json());
    const album = await updateTreeMediaAlbum(albumId, payload);
    return Response.json({ album, message: "Альбом обновлен." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { albumId } = await params;
    await deleteTreeMediaAlbum(albumId);
    return Response.json({ message: "Альбом удален." });
  } catch (error) {
    return toErrorResponse(error);
  }
}
