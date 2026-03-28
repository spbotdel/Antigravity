import { AppError, toErrorResponse } from "@/lib/server/errors";
import { processCloudflareVideoPreviewJobs } from "@/lib/server/repository";
import { processVideoPreviewJobsSchema } from "@/lib/validators/media";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorizeRequest(request: Request) {
  const expectedToken = process.env.INTERNAL_MEDIA_PREVIEW_TOKEN?.trim();
  if (!expectedToken) {
    throw new AppError(503, "INTERNAL_MEDIA_PREVIEW_TOKEN не настроен.");
  }

  const headerValue = request.headers.get("authorization") || "";
  const actualToken = headerValue.startsWith("Bearer ") ? headerValue.slice("Bearer ".length).trim() : "";
  if (!actualToken || actualToken !== expectedToken) {
    return false;
  }

  return true;
}

export async function POST(request: Request) {
  try {
    if (!authorizeRequest(request)) {
      return Response.json({ error: "Недостаточно прав для запуска processor route." }, { status: 401 });
    }

    const rawBody = await request.text();
    const parsedPayload = rawBody.trim() ? JSON.parse(rawBody) : {};
    const payload = processVideoPreviewJobsSchema.parse(parsedPayload);
    const result = await processCloudflareVideoPreviewJobs({
      limit: payload.limit,
      mediaIds: payload.mediaIds,
      forceRetry: payload.forceRetry
    });

    return Response.json(result, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
