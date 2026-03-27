import { toErrorResponse } from "@/lib/server/errors";
import { addExistingMediaToTreeMediaAlbum } from "@/lib/server/repository";
import { addMediaToTreeMediaAlbumSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const payload = addMediaToTreeMediaAlbumSchema.parse(await request.json());
    const result = await addExistingMediaToTreeMediaAlbum(payload);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
