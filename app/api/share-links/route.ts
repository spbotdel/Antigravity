import { toErrorResponse } from "@/lib/server/errors";
import { createShareLink, listShareLinks } from "@/lib/server/repository";
import { createShareLinkSchema, listShareLinksQuerySchema } from "@/lib/validators/share-link";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const payload = listShareLinksQuerySchema.parse({
      treeId: searchParams.get("treeId")
    });
    const shareLinks = await listShareLinks(payload.treeId);
    return Response.json({ shareLinks });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createShareLinkSchema.parse(await request.json());
    const result = await createShareLink(payload);
    return Response.json({ ...result, message: "Семейная ссылка создана." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
