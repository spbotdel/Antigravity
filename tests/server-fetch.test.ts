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
  });

  it("normalizes noisy JSON from native fetch", async () => {
    mocks.fetchMock.mockResolvedValue(createJsonResponse('\uFEFF{"ok":true}\u0000tail'));

    const fetcher = createServerSupabaseFetch(1000);
    const response = await fetcher("https://example.com");
    const payload = await response.json();

    expect(payload).toEqual({ ok: true });
  });

  it("falls back to PowerShell and normalizes JSON there as well", async () => {
    const timeoutError = new Error("fetch failed") as Error & { cause?: { code?: string } };
    timeoutError.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
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
    const timeoutError = new Error("fetch failed") as Error & { cause?: { code?: string } };
    timeoutError.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
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
});
