import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password helpers", () => {
  it("hashes without preserving plaintext", async () => {
    const password = "correct-horse-battery";

    const hash = await hashPassword(password);

    expect(hash).not.toContain(password);
    expect(hash).not.toBe(password);
  });

  it("uses bcrypt cost 12", async () => {
    const hash = await hashPassword("correct-horse-battery");

    expect(bcrypt.getRounds(hash)).toBe(12);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("correct-horse-battery");

    await expect(verifyPassword("correct-horse-battery", hash)).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery");

    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("rejects passwords shorter than 12 characters for admin-created users", async () => {
    await expect(hashPassword("short-pass")).rejects.toThrow("PASSWORD_TOO_SHORT");
  });
});
