import { describe, expect, it } from "vitest";

import { archiveMediaUploadIntentSchema, completeArchiveMediaSchema, completeMediaSchema, createTreeMediaAlbumSchema, mediaUploadIntentSchema, setPrimaryPersonMediaSchema } from "@/lib/validators/media";
import { createTreeSchema } from "@/lib/validators/tree";
import { inviteSchema } from "@/lib/validators/invite";

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

  it("accepts stored media completion payloads with variant paths", () => {
    const result = completeMediaSchema.safeParse({
      treeId: crypto.randomUUID(),
      personId: crypto.randomUUID(),
      mediaId: crypto.randomUUID(),
      storagePath: "trees/tree-1/media/photo/media-1/original.jpg",
      variantPaths: [
        { variant: "thumb", storagePath: "trees/tree-1/media/photo/media-1/variants/thumb.webp" },
        { variant: "small", storagePath: "trees/tree-1/media/photo/media-1/variants/small.webp" },
        { variant: "medium", storagePath: "trees/tree-1/media/photo/media-1/variants/medium.webp" }
      ],
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      visibility: "members",
      title: "Семейное фото",
      caption: "Архив"
    });

    expect(result.success).toBe(true);
  });

  it("accepts archive upload intent payloads", () => {
    const result = archiveMediaUploadIntentSchema.safeParse({
      treeId: crypto.randomUUID(),
      filename: "wedding-archive.jpg",
      mimeType: "image/jpeg",
      visibility: "members",
      title: "Свадьба",
      caption: "Общий архив"
    });

    expect(result.success).toBe(true);
  });

  it("accepts archive media completion payloads", () => {
    const result = completeArchiveMediaSchema.safeParse({
      treeId: crypto.randomUUID(),
      mediaId: crypto.randomUUID(),
      storagePath: "trees/tree-1/media/photo/media-1/original.jpg",
      variantPaths: [
        { variant: "thumb", storagePath: "trees/tree-1/media/photo/media-1/variants/thumb.webp" }
      ],
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      visibility: "members",
      title: "Семейный архив",
      caption: "Общие фото"
    });

    expect(result.success).toBe(true);
  });

  it("accepts tree media album creation payloads", () => {
    const result = createTreeMediaAlbumSchema.safeParse({
      treeId: crypto.randomUUID(),
      title: "День рождения тети Светы",
      description: "Фото и видео из одного архива"
    });

    expect(result.success).toBe(true);
  });

  it("accepts avatar selection payloads for person media", () => {
    const result = setPrimaryPersonMediaSchema.safeParse({
      personId: crypto.randomUUID(),
      setPrimary: true
    });

    expect(result.success).toBe(true);
  });

  it("requires email when invite delivery method is email", () => {
    const result = inviteSchema.safeParse({
      treeId: crypto.randomUUID(),
      role: "viewer",
      inviteMethod: "email",
      email: "",
      expiresInDays: 7
    });

    expect(result.success).toBe(false);
  });

  it("allows link invites without an email address", () => {
    const result = inviteSchema.safeParse({
      treeId: crypto.randomUUID(),
      role: "viewer",
      inviteMethod: "link",
      email: "",
      expiresInDays: 7
    });

    expect(result.success).toBe(true);
  });
});
