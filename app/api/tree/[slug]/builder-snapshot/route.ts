import { toErrorResponse } from "@/lib/server/errors";
import { getBuilderSnapshot } from "@/lib/server/repository";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const searchParams = new URL(request.url).searchParams;
    const includeMedia = searchParams.get("includeMedia") === "1";
    const shareToken = searchParams.get("share");
    const snapshot = await getBuilderSnapshot(slug, { includeMedia, shareToken });
    if (!snapshot.actor.canEdit) {
      return Response.json({ error: "У вас нет доступа к конструктору этого дерева." }, { status: 403 });
    }
    return Response.json(snapshot);
  } catch (error) {
    return toErrorResponse(error);
  }
}
