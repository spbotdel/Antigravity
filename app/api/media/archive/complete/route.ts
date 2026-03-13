import { toErrorResponse } from "@/lib/server/errors";
import { completeArchiveMediaUpload } from "@/lib/server/repository";
import { parsePowerShellJsonStdout } from "@/lib/supabase/admin-rest";
import { completeArchiveMediaSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = completeArchiveMediaSchema.parse(parsePowerShellJsonStdout(rawBody));
    const result = await completeArchiveMediaUpload(payload);
    return Response.json({ ...result, message: "Материал сохранен в семейный архив." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
