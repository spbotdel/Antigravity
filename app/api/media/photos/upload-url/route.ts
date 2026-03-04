import { toErrorResponse } from "@/lib/server/errors";
import { createPhotoUploadTarget } from "@/lib/server/repository";
import { photoUploadSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const payload = photoUploadSchema.parse(await request.json());
    const result = await createPhotoUploadTarget(payload);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
