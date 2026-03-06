import { toErrorResponse } from "@/lib/server/errors";
import { getTreeSnapshot } from "@/lib/server/repository";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const searchParams = new URL(request.url).searchParams;
    const includeMedia = searchParams.get("includeMedia") !== "0";
    const shareToken = searchParams.get("share");
    const snapshot = await getTreeSnapshot(slug, { includeMedia, shareToken });
    return Response.json(snapshot);
  } catch (error) {
    return toErrorResponse(error);
  }
}
