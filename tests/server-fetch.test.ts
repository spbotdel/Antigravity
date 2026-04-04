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

import { createServerSupabaseFetch, resetServerSupabaseFetchFallbackCooldownForTests } from "@/lib/supabase/server-fetch";

const originalPlatform = process.platform;

function setProcessPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

function createTimeoutLikeError() {
  const timeoutError = new Error("fetch failed") as Error & { cause?: { code?: string } };
  timeoutError.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
  return timeoutError;
}

function createJsonResponse(bodyText: string, status = 200) {
  return new Response(bodyText, {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("server supabase fetch", () => {
  beforeEach(() => {
    mocks.execFileMock.mockReset();
    mocks.fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mocks.fetchMock);
    resetServerSupabaseFetchFallbackCooldownForTests();
    setProcessPlatform(originalPlatform);
  });

  it("normalizes noisy JSON from native fetch", async () => {
    mocks.fetchMock.mockResolvedValue(createJsonResponse('\uFEFF{"ok":true}\u0000tail'));

    const fetcher = createServerSupabaseFetch(1000);
    const response = await fetcher("https://example.com");
    const payload = await response.json();

    expect(payload).toEqual({ ok: true });
  });

  it("falls back to PowerShell and normalizes JSON there as well", async () => {
    setProcessPlatform("win32");
    const timeoutError = createTimeoutLikeError();
    mocks.fetchMock.mockRejectedValue(timeoutError);
    mocks.execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, result: { stdout: string; stderr: string }) => void;
      callback(null, {
        stdout: JSON.stringify({
          status: 200,
          headers: { "content-type": "application/json" },
          bodyBase64: Buffer.from('\uFEFF{"ok":true}\u0000trail', "utf8").toString("base64")
        }),
        stderr: ""
      });
    });

    const fetcher = createServerSupabaseFetch(1000);
    const response = await fetcher("https://example.com");
    const payload = await response.json();

    expect(payload).toEqual({ ok: true });
    expect(mocks.execFileMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the PowerShell transport during cooldown after a native timeout", async () => {
    setProcessPlatform("win32");
    const timeoutError = createTimeoutLikeError();
    mocks.fetchMock.mockRejectedValue(timeoutError);
    mocks.execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, result: { stdout: string; stderr: string }) => void;
      callback(null, {
        stdout: JSON.stringify({
          status: 200,
          headers: { "content-type": "application/json" },
          bodyBase64: Buffer.from('{"ok":true}', "utf8").toString("base64")
        }),
        stderr: ""
      });
    });

    const fetcher = createServerSupabaseFetch(1000);
    const firstResponse = await fetcher("https://example.com/one");
    const secondResponse = await fetcher("https://example.com/two");

    expect(await firstResponse.json()).toEqual({ ok: true });
    expect(await secondResponse.json()).toEqual({ ok: true });
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.execFileMock).toHaveBeenCalledTimes(2);
  });

  it("does not attempt PowerShell fallback on non-win32 after a native timeout-style failure", async () => {
    setProcessPlatform("linux");
    mocks.fetchMock.mockRejectedValue(createTimeoutLikeError());

    const fetcher = createServerSupabaseFetch(1000);
    const response = await fetcher("https://example.com");
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      error: "fetch failed",
      code: "SUPABASE_UNAVAILABLE"
    });
    expect(mocks.execFileMock).not.toHaveBeenCalled();
  });

  it("ignores the global cooldown on non-win32 and stays on native fetch", async () => {
    setProcessPlatform("win32");
    mocks.fetchMock.mockRejectedValueOnce(createTimeoutLikeError()).mockResolvedValueOnce(createJsonResponse('{"ok":true}'));
    mocks.execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, result: { stdout: string; stderr: string }) => void;
      callback(null, {
        stdout: JSON.stringify({
          status: 200,
          headers: { "content-type": "application/json" },
          bodyBase64: Buffer.from('{"fallback":true}', "utf8").toString("base64")
        }),
        stderr: ""
      });
    });

    const fetcher = createServerSupabaseFetch(1000);
    const firstResponse = await fetcher("https://example.com/one");
    expect(await firstResponse.json()).toEqual({ fallback: true });

    setProcessPlatform("linux");
    const secondResponse = await fetcher("https://example.com/two");

    expect(await secondResponse.json()).toEqual({ ok: true });
    expect(mocks.fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.execFileMock).toHaveBeenCalledTimes(1);
  });
});
