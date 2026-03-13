import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

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

function deriveOpaqueTokenEncryptionKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptOpaqueToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveOpaqueTokenEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptOpaqueToken(payload: string, secret: string) {
  const [ivBase64, tagBase64, ciphertextBase64] = payload.split(".");
  if (!ivBase64 || !tagBase64 || !ciphertextBase64) {
    throw new Error("Некорректный формат зашифрованного токена.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveOpaqueTokenEncryptionKey(secret),
    Buffer.from(ivBase64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64url")),
    decipher.final()
  ]);

  return plaintext.toString("utf8");
}
