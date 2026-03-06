import { toErrorResponse } from "@/lib/server/errors";
import { createMediaUploadTarget } from "@/lib/server/repository";
import { mediaUploadIntentSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const payload = mediaUploadIntentSchema.parse(await request.json());
    const result = await createMediaUploadTarget(payload);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
