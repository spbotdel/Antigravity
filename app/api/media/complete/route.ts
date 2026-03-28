import { after } from "next/server";

import { toErrorResponse } from "@/lib/server/errors";
import { completeMediaUpload, processCloudflareVideoPreviewJobs } from "@/lib/server/repository";
import { parsePowerShellJsonStdout } from "@/lib/supabase/admin-rest";
import { completeMediaSchema } from "@/lib/validators/media";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = completeMediaSchema.parse(parsePowerShellJsonStdout(rawBody));
    const media = await completeMediaUpload(payload);

    if (media.kind === "video" && media.provider === "cloudflare_r2" && media.preview_status === "pending") {
      after(async () => {
        try {
          await processCloudflareVideoPreviewJobs({
            mediaIds: [media.id],
            limit: 1
          });
        } catch (error) {
          console.error("[video-preview] after() processing failed", error);
        }
      });
    }

    return Response.json({ media, message: "Файл сохранен." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
