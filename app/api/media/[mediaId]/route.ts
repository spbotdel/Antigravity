import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/server/errors";
import { deleteMedia, getMediaSummary, resolveMediaAccess, setPrimaryPersonMedia } from "@/lib/server/repository";
import { setPrimaryPersonMediaSchema } from "@/lib/validators/media";

interface Params {
  params: Promise<{ mediaId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const shareToken = searchParams.get("share");
    const download = searchParams.get("download") === "1";
    const summary = searchParams.get("summary") === "1";
    const rawVariant = searchParams.get("variant");
    const variant = !download && (rawVariant === "thumb" || rawVariant === "small" || rawVariant === "medium") ? rawVariant : null;
    if (summary) {
      const media = await getMediaSummary(mediaId, shareToken);
      return Response.json({ media });
    }
    const result = await resolveMediaAccess(mediaId, shareToken, variant, { download });
    return NextResponse.redirect(result.url);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    await deleteMedia(mediaId);
    return Response.json({ message: "Медиа удалено." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    const payload = setPrimaryPersonMediaSchema.parse(await request.json());
    const relation = await setPrimaryPersonMedia(mediaId, payload.personId, payload.avatarCrop);
    return Response.json({ relation, message: "Аватар обновлен." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

