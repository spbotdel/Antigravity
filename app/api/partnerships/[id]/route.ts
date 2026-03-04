import { toErrorResponse } from "@/lib/server/errors";
import { deletePartnership, updatePartnership } from "@/lib/server/repository";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = (await request.json()) as { status?: string; startDate?: string | null; endDate?: string | null };
    const partnership = await updatePartnership(id, payload);
    return Response.json({ partnership, message: "Данные пары обновлены." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await deletePartnership(id);
    return Response.json({ message: "Пара удалена." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

