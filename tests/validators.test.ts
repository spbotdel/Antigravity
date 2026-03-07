import { describe, expect, it } from "vitest";

import { completeMediaSchema, mediaUploadIntentSchema } from "@/lib/validators/media";
import { createTreeSchema } from "@/lib/validators/tree";

describe("validators", () => {
  it("accepts valid tree creation payloads", () => {
    const parsed = createTreeSchema.parse({
      title: "My Family",
      slug: "my-family",
      description: "desc"
    });

    expect(parsed.slug).toBe("my-family");
  });

  it("accepts unified media upload payloads for private files", () => {
    const result = mediaUploadIntentSchema.safeParse({
      treeId: crypto.randomUUID(),
      personId: crypto.randomUUID(),
      filename: "family-archive.pdf",
      mimeType: "application/pdf",
      visibility: "members",
      title: "Семейный архив",
      caption: "Скан письма"
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported media upload payloads", () => {
    const result = mediaUploadIntentSchema.safeParse({
      treeId: crypto.randomUUID(),
      personId: crypto.randomUUID(),
      filename: "",
      mimeType: "x",
      visibility: "members",
      title: "",
      caption: ""
    });

    expect(result.success).toBe(false);
  });

  it("accepts external video completion payloads", () => {
    const result = completeMediaSchema.safeParse({
      treeId: crypto.randomUUID(),
      personId: crypto.randomUUID(),
      mediaId: crypto.randomUUID(),
      provider: "yandex_disk",
      externalUrl: "https://disk.yandex.ru/i/family-video",
      visibility: "members",
      title: "Семейная видеозапись",
      caption: "Архивное видео"
    });

    expect(result.success).toBe(true);
  });
});
