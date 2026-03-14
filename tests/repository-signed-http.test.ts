import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mocks.execFileMock,
  default: {
    execFile: mocks.execFileMock
  }
}));

vi.stubGlobal("fetch", mocks.fetchMock);

import { uploadFileToSignedUrl } from "@/lib/server/repository";

describe("repository signed http transport", () => {
  beforeEach(() => {
    mocks.fetchMock.mockReset();
    mocks.execFileMock.mockReset();
  });

  it("uses native fetch for signed uploads without calling powershell", async () => {
    mocks.fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      uploadFileToSignedUrl({
        signedUrl: "https://example.com/upload",
        contentType: "image/png",
        fileBuffer: Buffer.from([1, 2, 3])
      })
    ).resolves.toBeUndefined();

    expect(mocks.fetchMock).toHaveBeenCalledWith(
      "https://example.com/upload",
      expect.objectContaining({
        method: "PUT",
        body: new Uint8Array(Buffer.from([1, 2, 3]))
      })
    );
    expect(mocks.execFileMock).not.toHaveBeenCalled();
  });

  it("returns a repository-level object storage error instead of powershell ENOENT on repeated native failure", async () => {
    const timeoutError = new Error("fetch failed") as Error & { cause?: { code?: string } };
    timeoutError.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
    mocks.fetchMock.mockRejectedValue(timeoutError);
    mocks.execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, result?: { stdout: string; stderr: string }) => void;
      callback(new Error("spawn powershell ENOENT"));
    });

    await expect(
      uploadFileToSignedUrl({
        signedUrl: "https://example.com/upload",
        contentType: "image/png",
        fileBuffer: Buffer.from([1, 2, 3])
      })
    ).rejects.toMatchObject({
      status: 503,
      message: "Сервер не смог связаться с object storage. Попробуйте еще раз."
    });
  });
});
