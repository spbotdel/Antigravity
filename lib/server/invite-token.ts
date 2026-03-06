import { createHash, randomBytes } from "crypto";

export function createOpaqueToken() {
  return randomBytes(24).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createInviteToken() {
  return createOpaqueToken();
}

export function hashInviteToken(token: string) {
  return hashOpaqueToken(token);
}
