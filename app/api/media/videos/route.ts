import { toErrorResponse } from "@/lib/server/errors";
import { createVideo } from "@/lib/server/repository";
import { videoSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const payload = videoSchema.parse(await request.json());
    const media = await createVideo(payload);
    return Response.json({ media, message: "Ссылка на видео сохранена." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

