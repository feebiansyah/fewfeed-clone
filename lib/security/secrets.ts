import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeBase64Url(encoded: string): Buffer {
  const decoded = Buffer.from(encoded, "base64url");
  if (decoded.toString("base64url") !== encoded) {
    throw new Error("invalid envelope");
  }
  return decoded;
}

function encryptionKey(): Buffer {
  const encoded = process.env.META_TOKEN_ENCRYPTION_KEY ?? "";
  if (!encoded || !BASE64_PATTERN.test(encoded)) {
    throw new Error("INVALID_META_TOKEN_ENCRYPTION_KEY");
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("INVALID_META_TOKEN_ENCRYPTION_KEY");
  }

  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(".");
}

export function decryptSecret(envelope: string): string {
  try {
    const [version, encodedIv, encodedCiphertext, encodedAuthTag, extra] = envelope.split(".");
    if (
      version !== ENVELOPE_VERSION ||
      !encodedIv ||
      !encodedCiphertext ||
      !encodedAuthTag ||
      extra !== undefined
    ) {
      throw new Error("invalid envelope");
    }

    const iv = decodeBase64Url(encodedIv);
    const ciphertext = decodeBase64Url(encodedCiphertext);
    const authTag = decodeBase64Url(encodedAuthTag);
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error("invalid envelope");
    }

    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_META_TOKEN_ENCRYPTION_KEY") {
      throw error;
    }
    throw new Error("INVALID_SECRET_ENVELOPE");
  }
}
