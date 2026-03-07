import { toErrorResponse } from "@/lib/server/errors";
import { completePhotoUpload } from "@/lib/server/repository";
import { parsePowerShellJsonStdout } from "@/lib/supabase/admin-rest";
import { completePhotoSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = completePhotoSchema.parse(parsePowerShellJsonStdout(rawBody));
    const media = await completePhotoUpload(payload);
    return Response.json({ media, message: "Фотография сохранена." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

