import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadFileToSignedUrl, sharpMock, sharpPipeline } = vi.hoisted(() => {
  const pipeline: {
    rotate: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    webp: ReturnType<typeof vi.fn>;
    toBuffer: ReturnType<typeof vi.fn>;
  } = {
    rotate: vi.fn(),
    resize: vi.fn(),
    webp: vi.fn(),
    toBuffer: vi.fn(async () => Buffer.from("variant-webp")),
  };

  pipeline.rotate.mockImplementation(() => pipeline);
  pipeline.resize.mockImplementation(() => pipeline);
  pipeline.webp.mockImplementation(() => pipeline);

  return {
    uploadFileToSignedUrl: vi.fn(),
    sharpMock: vi.fn(() => pipeline),
    sharpPipeline: pipeline,
  };
});

vi.mock("@/lib/server/repository", () => ({
  uploadFileToSignedUrl,
}));

vi.mock("sharp", () => ({
  default: sharpMock,
}));

import { POST } from "@/app/api/media/upload-file/route";

describe("upload-file route", () => {
  beforeEach(() => {
    uploadFileToSignedUrl.mockReset();
    sharpMock.mockClear();
    sharpPipeline.rotate.mockClear();
    sharpPipeline.resize.mockClear();
    sharpPipeline.webp.mockClear();
    sharpPipeline.toBuffer.mockClear();
  });

  it("uploads only preview variants when the original file was already sent directly", async () => {
    const formData = new FormData();
    formData.set("skipPrimaryUpload", "true");
    formData.set("contentType", "image/png");
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "family-photo.png", { type: "image/png" }));
    formData.set(
      "variantTargets",
      JSON.stringify([
        { variant: "thumb", signedUrl: "https://example.com/thumb", path: "thumb.webp" },
        { variant: "small", signedUrl: "https://example.com/small", path: "small.webp" },
      ]),
    );

    const response = await POST({ formData: async () => formData } as Request);
    expect(response.status).toBe(200);
    expect(sharpMock).toHaveBeenCalledTimes(2);
    expect(uploadFileToSignedUrl).toHaveBeenCalledTimes(2);
    expect(uploadFileToSignedUrl).toHaveBeenNthCalledWith(1, {
      signedUrl: "https://example.com/thumb",
      contentType: "image/webp",
      fileBuffer: Buffer.from("variant-webp"),
    });
    expect(uploadFileToSignedUrl).toHaveBeenNthCalledWith(2, {
      signedUrl: "https://example.com/small",
      contentType: "image/webp",
      fileBuffer: Buffer.from("variant-webp"),
    });
  });

  it("uploads the original file and generated variants in proxy mode", async () => {
    const formData = new FormData();
    formData.set("signedUrl", "https://example.com/original");
    formData.set("contentType", "image/png");
    formData.set("file", new File([new Uint8Array([4, 5, 6])], "family-photo.png", { type: "image/png" }));
    formData.set(
      "variantTargets",
      JSON.stringify([{ variant: "thumb", signedUrl: "https://example.com/thumb", path: "thumb.webp" }]),
    );

    const response = await POST({ formData: async () => formData } as Request);
    expect(response.status).toBe(200);
    expect(uploadFileToSignedUrl).toHaveBeenCalledTimes(2);
    expect(uploadFileToSignedUrl).toHaveBeenNthCalledWith(1, {
      signedUrl: "https://example.com/original",
      contentType: "image/png",
      fileBuffer: Buffer.from([4, 5, 6]),
    });
    expect(uploadFileToSignedUrl).toHaveBeenNthCalledWith(2, {
      signedUrl: "https://example.com/thumb",
      contentType: "image/webp",
      fileBuffer: Buffer.from("variant-webp"),
    });
  });

  it("allows video files up to 200 MB", async () => {
    const formData = new FormData();
    formData.set("signedUrl", "https://example.com/video");
    formData.set("contentType", "video/mp4");
    const file = new File([new Uint8Array([7, 8, 9])], "family-video.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", {
      configurable: true,
      value: 150 * 1024 * 1024,
    });
    formData.set("file", file);

    const response = await POST({ formData: async () => formData } as Request);

    expect(response.status).toBe(200);
    expect(uploadFileToSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("rejects video files above 200 MB", async () => {
    const formData = new FormData();
    formData.set("signedUrl", "https://example.com/video");
    formData.set("contentType", "video/mp4");
    const file = new File([new Uint8Array([7, 8, 9])], "too-big-video.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", {
      configurable: true,
      value: 201 * 1024 * 1024,
    });
    formData.set("file", file);

    const response = await POST({ formData: async () => formData } as Request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("200 МБ");
  });
});
