import { describe, expect, it } from "vitest";

import { translateAuthError } from "@/lib/auth-error";

describe("auth error translation", () => {
  it("maps empty structured auth failures to the Supabase availability message", () => {
    expect(translateAuthError("{}")).toContain("Не удается связаться с Supabase");
  });
});

