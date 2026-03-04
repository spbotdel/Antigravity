import { ZodError } from "zod";

export class AppError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function translateValidationMessage(message: string) {
  const replacements: Array<[RegExp, string]> = [
    [/Invalid uuid/i, "Некорректный идентификатор."],
    [/Invalid email/i, "Некорректный email."],
    [/Invalid url/i, "Некорректная ссылка."],
    [/String must contain at least (\d+) character\(s\)/i, "Поле должно содержать не менее $1 символов."],
    [/String must contain at most (\d+) character\(s\)/i, "Поле должно содержать не более $1 символов."],
    [/Too small: expected string to have >=(\d+) characters?/i, "Поле должно содержать не менее $1 символов."],
    [/Too big: expected string to have <=(\d+) characters?/i, "Поле должно содержать не более $1 символов."],
    [/Too small: expected number to be >=(\d+)/i, "Значение должно быть не меньше $1."],
    [/Too big: expected number to be <=(\d+)/i, "Значение должно быть не больше $1."],
    [/Invalid input/i, "Некорректные данные."]
  ];

  return replacements.reduce((current, [pattern, value]) => current.replace(pattern, value), message);
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: error.issues.map((issue) => translateValidationMessage(issue.message)).join("; ")
      },
      { status: 400 }
    );
  }

  const message = error instanceof Error ? error.message : "Непредвиденная ошибка сервера.";
  return Response.json({ error: message }, { status: 500 });
}

