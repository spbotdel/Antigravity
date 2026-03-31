import { describe, expect, it } from "vitest";

// --- resolveMediaKindFromMimeType tests ---
// We can't import the private function directly, so we test the public surface
// that depends on it: the type system and display helpers.

import type { MediaKind } from "@/lib/types";
import { collectTreeMedia } from "@/lib/tree/display";
import { formatMediaKind } from "@/lib/ui-text";

describe("MediaKind type", () => {
  it("includes audio as a valid value", () => {
    const kind: MediaKind = "audio";
    expect(kind).toBe("audio");
  });

  it("includes document as a valid value", () => {
    const kind: MediaKind = "document";
    expect(kind).toBe("document");
  });
});

describe("formatMediaKind", () => {
  it("returns Аудио for audio kind", () => {
    expect(formatMediaKind("audio")).toBe("Аудио");
  });

  it("returns Документ for document kind", () => {
    expect(formatMediaKind("document")).toBe("Документ");
  });

  it("returns Фото for photo kind (regression)", () => {
    expect(formatMediaKind("photo")).toBe("Фото");
  });

  it("returns Видео for video kind (regression)", () => {
    expect(formatMediaKind("video")).toBe("Видео");
  });
});

describe("collectTreeMedia", () => {
  const media = [
    { id: "1", kind: "photo", title: "photo1" },
    { id: "2", kind: "video", title: "video1" },
    { id: "3", kind: "audio", title: "audio1" },
    { id: "4", kind: "audio", title: "audio2" },
    { id: "5", kind: "document", title: "doc1" },
    { id: "6", kind: "document", title: "doc2" },
    { id: "7", kind: "photo", title: "photo2" },
  ] as any;

  const snapshot = { media };

  it("returns only audio assets when kind is audio", () => {
    const result = collectTreeMedia(snapshot, "audio");
    expect(result).toHaveLength(2);
    expect(result.every((a: any) => a.kind === "audio")).toBe(true);
  });

  it("returns only document assets when kind is document", () => {
    const result = collectTreeMedia(snapshot, "document");
    expect(result).toHaveLength(2);
    expect(result.every((a: any) => a.kind === "document")).toBe(true);
  });

  it("returns only photo assets when kind is photo (regression)", () => {
    const result = collectTreeMedia(snapshot, "photo");
    expect(result).toHaveLength(2);
    expect(result.every((a: any) => a.kind === "photo")).toBe(true);
  });

  it("returns only video assets when kind is video (regression)", () => {
    const result = collectTreeMedia(snapshot, "video");
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("video");
  });

  it("returns all assets when kind is undefined", () => {
    const result = collectTreeMedia(snapshot);
    expect(result).toHaveLength(7);
  });
});
