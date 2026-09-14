import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/security/secrets";

describe("secret encryption", () => {
  beforeEach(() => {
    process.env.META_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    delete process.env.META_TOKEN_ENCRYPTION_KEY;
  });

  it("round-trips a secret", () => {
    const plaintext = "meta-access-token";
    const envelope = encryptSecret(plaintext);

    expect(envelope).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(envelope).not.toContain(plaintext);
    expect(decryptSecret(envelope)).toBe(plaintext);
  });

  it("uses randomized IVs so identical plaintext encrypts differently", () => {
    expect(encryptSecret("same-secret")).not.toBe(encryptSecret("same-secret"));
  });

  it("fails closed on a modified ciphertext", () => {
    const parts = encryptSecret("sensitive").split(".");
    const ciphertext = parts[2];
    parts[2] = `${ciphertext.slice(0, -1)}${ciphertext.endsWith("A") ? "B" : "A"}`;

    expect(() => decryptSecret(parts.join("."))).toThrow("INVALID_SECRET_ENVELOPE");
  });

  it("rejects an encryption key that is not exactly 32 bytes after base64 decoding", () => {
    process.env.META_TOKEN_ENCRYPTION_KEY = randomBytes(31).toString("base64");

    expect(() => encryptSecret("secret")).toThrow("INVALID_META_TOKEN_ENCRYPTION_KEY");
  });
});
