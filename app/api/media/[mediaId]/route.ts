import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/server/errors";
import { deleteMedia, resolveMediaAccess } from "@/lib/server/repository";

interface Params {
  params: Promise<{ mediaId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    const shareToken = new URL(request.url).searchParams.get("share");
    const result = await resolveMediaAccess(mediaId, shareToken);
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

