import { toErrorResponse } from "@/lib/server/errors";
import { createTreeMediaAlbum } from "@/lib/server/repository";
import { createTreeMediaAlbumSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const payload = createTreeMediaAlbumSchema.parse(await request.json());
    const album = await createTreeMediaAlbum(payload);
    return Response.json({ album, message: "Альбом создан." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
