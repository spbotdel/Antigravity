import { toErrorResponse } from "@/lib/server/errors";
import { completeMediaUpload } from "@/lib/server/repository";
import { parsePowerShellJsonStdout } from "@/lib/supabase/admin-rest";
import { completeMediaSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = completeMediaSchema.parse(parsePowerShellJsonStdout(rawBody));
    const media = await completeMediaUpload(payload);
    return Response.json({ media, message: "Файл сохранен." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
