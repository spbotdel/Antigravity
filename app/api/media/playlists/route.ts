import { toErrorResponse } from "@/lib/server/errors";
import { createTreeAudioPlaylist } from "@/lib/server/repository";
import { createTreeAudioPlaylistSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const payload = createTreeAudioPlaylistSchema.parse(await request.json());
    const playlist = await createTreeAudioPlaylist(payload);
    return Response.json({ playlist, message: "Плейлист создан." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
