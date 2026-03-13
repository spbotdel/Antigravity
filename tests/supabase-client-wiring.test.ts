import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  createServerSupabaseFetch: vi.fn(),
  nextResponse: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/env", () => ({
  getSupabaseEnv: () => ({
    url: "https://supabase.test",
    anonKey: "anon-key",
  }),
}));

vi.mock("@/lib/supabase/server-fetch", () => ({
  createServerSupabaseFetch: mocks.createServerSupabaseFetch,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: mocks.nextResponse,
  },
}));

describe("server-side Supabase client wiring", () => {
  beforeEach(() => {
    mocks.cookies.mockReset();
    mocks.createServerClient.mockReset();
    mocks.createServerSupabaseFetch.mockReset();
    mocks.nextResponse.mockReset();
  });

  it("uses createServerSupabaseFetch for the server client", async () => {
    const fetchSentinel = vi.fn();
    mocks.createServerSupabaseFetch.mockReturnValue(fetchSentinel);
    mocks.cookies.mockResolvedValue({
      getAll: vi.fn().mockReturnValue([]),
    });
    mocks.createServerClient.mockReturnValue({ auth: {} });

    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    await createServerSupabaseClient();

    expect(mocks.createServerSupabaseFetch).toHaveBeenCalled();
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://supabase.test",
      "anon-key",
      expect.objectContaining({
        global: expect.objectContaining({
          fetch: fetchSentinel,
        }),
      })
    );
  });

  it("uses createServerSupabaseFetch for the route client", async () => {
    const fetchSentinel = vi.fn();
    const set = vi.fn();
    mocks.createServerSupabaseFetch.mockReturnValue(fetchSentinel);
    mocks.cookies.mockResolvedValue({
      getAll: vi.fn().mockReturnValue([]),
      set,
    });
    mocks.createServerClient.mockReturnValue({ auth: {} });

    const { createRouteSupabaseClient } = await import("@/lib/supabase/route");
    await createRouteSupabaseClient();

    expect(mocks.createServerSupabaseFetch).toHaveBeenCalled();
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://supabase.test",
      "anon-key",
      expect.objectContaining({
        global: expect.objectContaining({
          fetch: fetchSentinel,
        }),
      })
    );
  });

  it("uses createServerSupabaseFetch in middleware session updates", async () => {
    const fetchSentinel = vi.fn();
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
    const requestCookieSet = vi.fn();
    const responseCookieSet = vi.fn();
    const responseObject = {
      cookies: {
        set: responseCookieSet,
      },
    };

    mocks.createServerSupabaseFetch.mockReturnValue(fetchSentinel);
    mocks.nextResponse.mockReturnValue(responseObject);
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser,
      },
    });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const request = {
      headers: new Headers(),
      cookies: {
        getAll: vi.fn().mockReturnValue([]),
        set: requestCookieSet,
      },
    };

    const response = await updateSession(request as never);

    expect(mocks.createServerSupabaseFetch).toHaveBeenCalled();
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://supabase.test",
      "anon-key",
      expect.objectContaining({
        global: expect.objectContaining({
          fetch: fetchSentinel,
        }),
      })
    );
    expect(getUser).toHaveBeenCalled();
    expect(response).toBe(responseObject);
  });
});
