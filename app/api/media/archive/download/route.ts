import path from "node:path";

import { zipSync } from "fflate";

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

export async function POST(request: Request) {
  try {
    const payload = downloadArchiveMediaSchema.parse(await request.json());
    const media = await listExistingArchiveMediaForEditor(payload);
    if (!media.length) {
      return Response.json({ error: "Не выбраны материалы для скачивания." }, { status: 400 });
    }

    const usedEntryNames = new Set<string>();
    const zipEntries: Record<string, Uint8Array> = {};

    for (const asset of media) {
      const access = await resolveMediaAccess(asset.id, null, null, { download: false });
      const response = await fetch(access.url);
      if (!response.ok) {
        throw new Error(`Не удалось скачать файл «${asset.title}».`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const entryName = buildZipEntryName(
        {
          title: asset.title,
          fallbackName: asset.storage_path ? path.basename(asset.storage_path) : `media-${asset.id}`,
        },
        usedEntryNames
      );
      zipEntries[entryName] = new Uint8Array(arrayBuffer);
    }

    const zip = zipSync(zipEntries, { level: 0 });
    const filename = `archive-media-${new Date().toISOString().slice(0, 10)}.zip`;

    return new Response(Buffer.from(zip), {
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
