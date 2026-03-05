import { toErrorResponse } from "@/lib/server/errors";
import { getBuilderSnapshot } from "@/lib/server/repository";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const includeMedia = new URL(request.url).searchParams.get("includeMedia") === "1";
    const snapshot = await getBuilderSnapshot(slug, { includeMedia });
    return Response.json(snapshot);
  } catch (error) {
    return toErrorResponse(error);
  }
}
