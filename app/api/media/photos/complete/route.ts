import { toErrorResponse } from "@/lib/server/errors";
import { completePhotoUpload } from "@/lib/server/repository";
import { completePhotoSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const payload = completePhotoSchema.parse(await request.json());
    const media = await completePhotoUpload(payload);
    return Response.json({ media, message: "Фотография сохранена." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

