import { describe, expect, it } from "vitest";

import { createInviteToken, decryptOpaqueToken, encryptOpaqueToken, hashInviteToken } from "@/lib/server/invite-token";

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

  it("encrypts and decrypts opaque tokens", () => {
    const token = "share-token";
    const secret = "test-secret";
    const encrypted = encryptOpaqueToken(token, secret);

    expect(encrypted).not.toContain(token);
    expect(decryptOpaqueToken(encrypted, secret)).toBe(token);
  });
});
