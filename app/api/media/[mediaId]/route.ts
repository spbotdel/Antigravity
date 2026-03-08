import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/server/errors";
import { deleteMedia, resolveMediaAccess } from "@/lib/server/repository";

interface Params {
  params: Promise<{ mediaId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const shareToken = searchParams.get("share");
    const rawVariant = searchParams.get("variant");
    const variant = rawVariant === "thumb" || rawVariant === "small" || rawVariant === "medium" ? rawVariant : null;
    const result = await resolveMediaAccess(mediaId, shareToken, variant);
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

