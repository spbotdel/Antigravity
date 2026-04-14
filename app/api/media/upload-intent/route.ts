import { toErrorResponse } from "@/lib/server/errors";
import { createMediaUploadTarget } from "@/lib/server/repository";
import { mediaUploadIntentSchema } from "@/lib/validators/media";
import type { MediaUploadTargetResponse } from "@/lib/types";

function shouldForceProxyUploadForRequest(request: Request) {
  const origin = request.headers.get("origin") || "";
  if (!origin) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.origin === "http://localhost:3000") {
      return false;
    }

    return parsedOrigin.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function applyHostedProxyUploadHotfix(result: MediaUploadTargetResponse, request: Request): MediaUploadTargetResponse {
  if (
    result.configuredBackend !== "cloudflare_r2" ||
    result.uploadMode !== "direct" ||
    !shouldForceProxyUploadForRequest(request)
  ) {
    return result;
  }

  return {
    ...result,
    forceProxyUpload: true,
    uploadMode: "proxy",
  };
}

export async function POST(request: Request) {
  try {
    const payload = mediaUploadIntentSchema.parse(await request.json());
    const result = applyHostedProxyUploadHotfix(await createMediaUploadTarget(payload), request);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
