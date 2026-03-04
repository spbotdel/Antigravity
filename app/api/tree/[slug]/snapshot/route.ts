import { toErrorResponse } from "@/lib/server/errors";
import { getTreeSnapshot } from "@/lib/server/repository";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const snapshot = await getTreeSnapshot(slug);
    return Response.json(snapshot);
  } catch (error) {
    return toErrorResponse(error);
  }
}
