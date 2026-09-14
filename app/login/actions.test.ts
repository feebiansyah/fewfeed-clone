import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT:/dashboard");
  }),
}));

vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: mocks.findUnique } },
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: mocks.createSession,
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { login } from "@/app/login/actions";

const user = {
  id: "user-1",
  email: "admin@example.com",
  passwordHash: "stored-password-hash",
  isActive: true,
};

function credentials(email: string, password: string): FormData {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  return formData;
}

describe("login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes email before lookup", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await login({}, credentials("  Admin@Example.COM ", "secret-password"));

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
    });
  });

  it("rejects unknown email with a generic invalid-credentials message", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(
      login({}, credentials("unknown@example.com", "secret-password")),
    ).resolves.toEqual({ error: "INVALID_CREDENTIALS" });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejects wrong password with the same generic message", async () => {
    mocks.findUnique.mockResolvedValue(user);
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(
      login({}, credentials("admin@example.com", "wrong-password")),
    ).resolves.toEqual({ error: "INVALID_CREDENTIALS" });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejects disabled users", async () => {
    mocks.findUnique.mockResolvedValue({ ...user, isActive: false });
    mocks.verifyPassword.mockResolvedValue(true);

    await expect(
      login({}, credentials("admin@example.com", "secret-password")),
    ).resolves.toEqual({ error: "ACCOUNT_DISABLED" });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("creates a session for valid credentials", async () => {
    mocks.findUnique.mockResolvedValue(user);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.createSession.mockResolvedValue(undefined);

    await expect(
      login({}, credentials("admin@example.com", "secret-password")),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(mocks.createSession).toHaveBeenCalledWith("user-1");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });
});
