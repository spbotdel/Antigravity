import path from "node:path";

import { Zip, ZipPassThrough } from "fflate";

import { getCurrentUser } from "@/lib/server/auth";
import { toErrorResponse } from "@/lib/server/errors";
import { listExistingArchiveMediaForEditor, resolveMediaAccess } from "@/lib/server/repository";
import { downloadArchiveMediaSchema } from "@/lib/validators/media";

function sanitizeZipEntryName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "media";
}

function buildZipEntryName(input: { title: string; fallbackName: string }, usedNames: Set<string>) {
  const rawName = sanitizeZipEntryName(input.title || input.fallbackName);
  const ext = path.extname(rawName);
  const base = ext ? rawName.slice(0, -ext.length) : rawName;

  let candidate = rawName;
  let index = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base} (${index})${ext}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

async function pipeResponseBodyToZipEntry(response: Response, entry: ZipPassThrough) {
  if (!response.body) {
    throw new Error("Файл недоступен для потокового скачивания.");
  }

  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      entry.push(value, false);
    }

    entry.push(new Uint8Array(0), true);
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  try {
    const payload = downloadArchiveMediaSchema.parse(await request.json());
    const media = await listExistingArchiveMediaForEditor(payload);
    if (!media.length) {
      return Response.json({ error: "Не выбраны материалы для скачивания." }, { status: 400 });
    }

    const resolvedUser = await getCurrentUser();
    const usedEntryNames = new Set<string>();
    const filename = `archive-media-${new Date().toISOString().slice(0, 10)}.zip`;
    let zip: Zip | null = null;

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let streamFailed = false;
        zip = new Zip((error, chunk, final) => {
          if (streamFailed) {
            return;
          }

          if (error) {
            streamFailed = true;
            controller.error(error);
            return;
          }

          controller.enqueue(chunk);
          if (final) {
            controller.close();
          }
        });

        try {
          for (const asset of media) {
            const access = await resolveMediaAccess(asset.id, null, null, {
              download: false,
              resolvedUser
            });
            const response = await fetch(access.url);
            if (!response.ok) {
              throw new Error(`Не удалось скачать файл «${asset.title}».`);
            }

            const entryName = buildZipEntryName(
              {
                title: asset.title,
                fallbackName: asset.storage_path ? path.basename(asset.storage_path) : `media-${asset.id}`,
              },
              usedEntryNames
            );
            const entry = new ZipPassThrough(entryName);
            zip.add(entry);
            await pipeResponseBodyToZipEntry(response, entry);
          }

          zip.end();
        } catch (error) {
          streamFailed = true;
          zip.terminate();
          controller.error(error);
        }
      },
      cancel() {
        zip?.terminate();
      }
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
