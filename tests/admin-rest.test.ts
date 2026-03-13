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

vi.mock("@/lib/env", () => ({
  getSupabaseServiceEnv: () => ({
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role-key"
  })
}));

import {
  fetchSupabaseAdminRestBatchJson,
  fetchSupabaseAdminRestJson,
  fetchSupabaseAdminRestJsonWithHeaders,
  resetAdminRestFallbackCooldownForTests
} from "@/lib/supabase/admin-rest";

function createJsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status || 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    }
  });
}

function createPowerShellResult(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return JSON.stringify({
    status: init?.status || 200,
    headers: init?.headers || {},
    bodyBase64: Buffer.from(JSON.stringify(body), "utf8").toString("base64")
  });
}

function createPowerShellBatchResult(bodies: unknown[]) {
  return JSON.stringify(
    bodies.map((body) => ({
      status: 200,
      bodyBase64: Buffer.from(JSON.stringify(body), "utf8").toString("base64")
    }))
  );
}

describe("admin rest transport", () => {
  beforeEach(() => {
    mocks.fetchMock.mockReset();
    mocks.execFileMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.stubGlobal("fetch", mocks.fetchMock);
    resetAdminRestFallbackCooldownForTests();
  });

  it("uses native fetch for admin rest requests by default", async () => {
    mocks.fetchMock.mockResolvedValue(
      createJsonResponse([{ id: "tree-1" }], {
        headers: {
          "content-range": "0-0/1"
        }
      })
    );

    const result = await fetchSupabaseAdminRestJsonWithHeaders<Array<{ id: string }>>("trees?select=id");

    expect(mocks.fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/trees?select=id",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          apikey: "service-role-key",
          authorization: "Bearer service-role-key"
        })
      })
    );
    expect(mocks.execFileMock).not.toHaveBeenCalled();
    expect(result.data).toEqual([{ id: "tree-1" }]);
    expect(result.headers["content-range"]).toBe("0-0/1");
  });

  it("falls back to PowerShell for single requests on transport timeout", async () => {
    const timeoutError = new Error("fetch failed") as Error & { cause?: { code?: string } };
    timeoutError.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
    mocks.fetchMock.mockRejectedValue(timeoutError);
    mocks.execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, result: { stdout: string; stderr: string }) => void;
      callback(null, {
        stdout: createPowerShellResult([{ id: "tree-1" }]),
        stderr: ""
      });
    });

    const result = await fetchSupabaseAdminRestJson<Array<{ id: string }>>("trees?select=id");

    expect(mocks.execFileMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: "tree-1" }]);
  });

  it("falls back once for the whole batch when native transport fails", async () => {
    const timeoutError = new Error("fetch failed") as Error & { cause?: { code?: string } };
    timeoutError.cause = { code: "ETIMEDOUT" };
    mocks.fetchMock.mockRejectedValue(timeoutError);
    mocks.execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, result: { stdout: string; stderr: string }) => void;
      callback(null, {
        stdout: createPowerShellBatchResult([[{ id: "tree-1" }], [{ id: "tree-2" }]]),
        stderr: ""
      });
    });

    const result = await fetchSupabaseAdminRestBatchJson<Array<{ id: string }>>([
      { pathWithQuery: "trees?select=id&limit=1" },
      { pathWithQuery: "persons?select=id&limit=1" }
    ]);

    expect(mocks.execFileMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([[{ id: "tree-1" }], [{ id: "tree-2" }]]);
  });

  it("reuses PowerShell admin rest during cooldown after native transport failure", async () => {
    const timeoutError = new Error("fetch failed") as Error & { cause?: { code?: string } };
    timeoutError.cause = { code: "ETIMEDOUT" };
    mocks.fetchMock.mockRejectedValue(timeoutError);
    mocks.execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, result: { stdout: string; stderr: string }) => void;
      callback(null, {
        stdout: createPowerShellResult([{ id: "tree-1" }]),
        stderr: ""
      });
    });

    const first = await fetchSupabaseAdminRestJson<Array<{ id: string }>>("trees?select=id");
    const second = await fetchSupabaseAdminRestJson<Array<{ id: string }>>("trees?select=id&limit=1");

    expect(first).toEqual([{ id: "tree-1" }]);
    expect(second).toEqual([{ id: "tree-1" }]);
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.execFileMock).toHaveBeenCalledTimes(2);
  });
});
