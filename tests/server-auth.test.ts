import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

import { getCurrentUser, requireAuthenticatedUserId } from "@/lib/server/auth";

const originalNodeEnv = process.env.NODE_ENV;
const originalImpersonateId = process.env.DEV_IMPERSONATE_USER_ID;
const originalImpersonateEmail = process.env.DEV_IMPERSONATE_USER_EMAIL;

describe("server auth", () => {
  beforeEach(() => {
    mocks.createServerSupabaseClient.mockReset();
    delete process.env.DEV_IMPERSONATE_USER_ID;
    delete process.env.DEV_IMPERSONATE_USER_EMAIL;
    Object.assign(process.env, { NODE_ENV: "test" });
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      Object.assign(process.env, { NODE_ENV: originalNodeEnv });
    }
    if (originalImpersonateId === undefined) {
      delete process.env.DEV_IMPERSONATE_USER_ID;
    } else {
      process.env.DEV_IMPERSONATE_USER_ID = originalImpersonateId;
    }
    if (originalImpersonateEmail === undefined) {
      delete process.env.DEV_IMPERSONATE_USER_EMAIL;
    } else {
      process.env.DEV_IMPERSONATE_USER_EMAIL = originalImpersonateEmail;
    }
  });

  it("uses dev impersonation in development mode", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.DEV_IMPERSONATE_USER_ID = "user-dev";
    process.env.DEV_IMPERSONATE_USER_EMAIL = "dev@example.com";

    const user = await getCurrentUser();

    expect(user).toEqual({
      id: "user-dev",
      email: "dev@example.com",
    });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("reads the authenticated user via getUser on the server client", async () => {
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-1",
              email: "user@example.com",
            },
          },
          error: null,
        }),
      },
    });

    const user = await getCurrentUser();

    expect(user).toEqual({
      id: "user-1",
      email: "user@example.com",
    });
  });

  it("returns null when the server auth client has no user", async () => {
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const user = await getCurrentUser();

    expect(user).toBeNull();
  });

  it("returns authenticated user id when available", async () => {
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-42",
              email: "owner@example.com",
            },
          },
          error: null,
        }),
      },
    });

    await expect(requireAuthenticatedUserId()).resolves.toBe("user-42");
  });
});
