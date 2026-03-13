import { toErrorResponse } from "@/lib/server/errors";
import { createArchiveMediaUploadTarget } from "@/lib/server/repository";
import { archiveMediaUploadIntentSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const payload = archiveMediaUploadIntentSchema.parse(await request.json());
    const result = await createArchiveMediaUploadTarget(payload);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
