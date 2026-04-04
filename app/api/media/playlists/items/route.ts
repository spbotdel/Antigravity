import { toErrorResponse } from "@/lib/server/errors";
import { addAudioMediaToTreeAudioPlaylist } from "@/lib/server/repository";
import { addAudioMediaToPlaylistSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const payload = addAudioMediaToPlaylistSchema.parse(await request.json());
    const result = await addAudioMediaToTreeAudioPlaylist(payload);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
