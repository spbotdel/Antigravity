import { toErrorResponse } from "@/lib/server/errors";
import { completeMediaUpload } from "@/lib/server/repository";
import { completeMediaSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const payload = completeMediaSchema.parse(await request.json());
    const media = await completeMediaUpload(payload);
    return Response.json({ media, message: "Файл сохранен." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
