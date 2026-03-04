import { toErrorResponse } from "@/lib/server/errors";
import { deletePerson, updatePerson } from "@/lib/server/repository";
import { personUpdateSchema } from "@/lib/validators/person";

interface Params {
  params: Promise<{ personId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { personId } = await params;
    const payload = personUpdateSchema.parse(await request.json());
    const person = await updatePerson(personId, payload);
    return Response.json({ person, message: "Данные человека обновлены." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { personId } = await params;
    await deletePerson(personId);
    return Response.json({ message: "Человек удален." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

