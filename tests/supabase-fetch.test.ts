import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetchMock);

import { createSupabaseFetch } from "@/lib/supabase/fetch";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("browser supabase fetch", () => {
  beforeEach(() => {
    mocks.fetchMock.mockReset();
  });

  it("retries a transient browser fetch failure once before returning success", async () => {
    mocks.fetchMock
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(createJsonResponse({ ok: true }));

    const fetcher = createSupabaseFetch(1000);
    const response = await fetcher("https://example.com");
    const payload = await response.json();

    expect(mocks.fetchMock).toHaveBeenCalledTimes(2);
    expect(payload).toEqual({ ok: true });
  });

  it("returns a synthetic unavailable response after repeated fetch failures", async () => {
    mocks.fetchMock.mockRejectedValue(new Error("fetch failed"));

    const fetcher = createSupabaseFetch(1000);
    const response = await fetcher("https://example.com");
    const payload = await response.json();

    expect(mocks.fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: "fetch failed",
      message: "fetch failed",
      code: "SUPABASE_UNAVAILABLE"
    });
  });
});

