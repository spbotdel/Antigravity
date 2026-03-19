import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const originalPlatform = process.platform;

function setProcessPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

function createSignedHttpTimeoutError() {
  const timeoutError = new Error("fetch failed") as Error & { cause?: { code?: string } };
  timeoutError.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
  return timeoutError;
}

describe("repository signed http transport", () => {
  beforeEach(() => {
    mocks.fetchMock.mockReset();
    mocks.execFileMock.mockReset();
  });

  afterEach(() => {
    setProcessPlatform(originalPlatform);
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

  it("falls back to powershell on win32 when native signed upload times out", async () => {
    setProcessPlatform("win32");
    mocks.fetchMock.mockRejectedValue(createSignedHttpTimeoutError());
    mocks.execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, result?: { stdout: string; stderr: string }) => void;
      callback(null, { stdout: "{\"status\":200}", stderr: "" });
    });

    await expect(
      uploadFileToSignedUrl({
        signedUrl: "https://example.com/upload",
        contentType: "image/png",
        fileBuffer: Buffer.from([1, 2, 3])
      })
    ).resolves.toBeUndefined();

    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.execFileMock).toHaveBeenCalledTimes(1);
  });

  it("degrades to a repository-level 503 on non-win32 when native signed upload times out", async () => {
    setProcessPlatform("linux");
    mocks.fetchMock.mockRejectedValue(createSignedHttpTimeoutError());

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

    expect(mocks.execFileMock).not.toHaveBeenCalled();
  });

  it("returns a repository-level 503 when powershell is unavailable on win32 after native timeout", async () => {
    setProcessPlatform("win32");
    mocks.fetchMock.mockRejectedValue(createSignedHttpTimeoutError());
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

    expect(mocks.execFileMock).toHaveBeenCalledTimes(1);
  });

  it("returns a repository-level 503 when the powershell fallback itself fails on win32", async () => {
    setProcessPlatform("win32");
    mocks.fetchMock.mockRejectedValue(createSignedHttpTimeoutError());
    mocks.execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, result?: { stdout: string; stderr: string }) => void;
      callback(null, { stdout: "not-json", stderr: "" });
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

    expect(mocks.execFileMock).toHaveBeenCalledTimes(1);
  });
});
