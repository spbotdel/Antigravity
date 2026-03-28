import { after } from "next/server";

import { toErrorResponse } from "@/lib/server/errors";
import { completeArchiveMediaUpload, processCloudflareVideoPreviewJobs } from "@/lib/server/repository";
import { parsePowerShellJsonStdout } from "@/lib/supabase/admin-rest";
import { completeArchiveMediaSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = completeArchiveMediaSchema.parse(parsePowerShellJsonStdout(rawBody));
    const result = await completeArchiveMediaUpload(payload);

    if (result.media.kind === "video" && result.media.provider === "cloudflare_r2" && result.media.preview_status === "pending") {
      after(async () => {
        try {
          await processCloudflareVideoPreviewJobs({
            mediaIds: [result.media.id],
            limit: 1
          });
        } catch (error) {
          console.error("[video-preview] after() archive processing failed", error);
        }
      });
    }

    return Response.json({ ...result, message: "Материал сохранен в семейный архив." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
