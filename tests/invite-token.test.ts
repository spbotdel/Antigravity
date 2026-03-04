import { describe, expect, it } from "vitest";

import { createInviteToken, hashInviteToken } from "@/lib/server/invite-token";

describe("invite token helpers", () => {
  it("creates reasonably long random tokens", () => {
    const token = createInviteToken();
    expect(token.length).toBeGreaterThan(20);
  });

  it("hashes deterministically", () => {
    const first = hashInviteToken("abc123");
    const second = hashInviteToken("abc123");
    const third = hashInviteToken("different");

    expect(first).toEqual(second);
    expect(first).not.toEqual(third);
  });
});
