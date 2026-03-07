import { toErrorResponse } from "@/lib/server/errors";
import { uploadFileToSignedUrl } from "@/lib/server/repository";

const MAX_MEDIA_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const signedUrl = String(formData.get("signedUrl") || "").trim();
    const contentType = String(formData.get("contentType") || "").trim() || undefined;
    const file = formData.get("file");

    if (!signedUrl) {
      return Response.json({ error: "Не передан signed URL для загрузки." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return Response.json({ error: "Файл для загрузки не найден." }, { status: 400 });
    }

    if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
      return Response.json(
        {
          error: `Размер файла превышает ${Math.round(MAX_MEDIA_FILE_SIZE_BYTES / (1024 * 1024))} МБ.`
        },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await uploadFileToSignedUrl({
      signedUrl,
      contentType,
      fileBuffer
    });

    return Response.json({ message: "Файл загружен в storage." });
  } catch (error) {
    return toErrorResponse(error);
  }
}
