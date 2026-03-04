import { toErrorResponse } from "@/lib/server/errors";
import { createPerson } from "@/lib/server/repository";
import { personSchema } from "@/lib/validators/person";

export async function POST(request: Request) {
  try {
    const payload = personSchema.parse(await request.json());
    const person = await createPerson(payload);
    return Response.json({ person, message: "Человек добавлен." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

