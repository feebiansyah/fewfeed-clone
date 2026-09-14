import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sessionCreate: vi.fn(),
  sessionDeleteMany: vi.fn(),
  sessionFindUnique: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    session: {
      create: mocks.sessionCreate,
      deleteMany: mocks.sessionDeleteMany,
      findUnique: mocks.sessionFindUnique,
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  }),
}));

import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";

const activeUser = {
  id: "user-1",
  email: "user@example.com",
  passwordHash: "hash",
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("server sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("stores only sha256(sessionToken) in the database", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T00:00:00.000Z"));
    mocks.sessionCreate.mockResolvedValue({});

    await createSession("user-1");

    const cookie = mocks.cookieSet.mock.calls[0][0];
    const stored = mocks.sessionCreate.mock.calls[0][0].data;
    const expectedHash = createHash("sha256").update(cookie.value).digest("hex");
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored).toEqual({
      userId: "user-1",
      tokenHash: expectedHash,
      expiresAt: new Date("2026-09-21T00:00:00.000Z"),
    });
    expect(JSON.stringify(stored)).not.toContain(cookie.value);
  });

  it("sets the seven-day HTTP-only session cookie with required flags", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T00:00:00.000Z"));
    mocks.sessionCreate.mockResolvedValue({});

    await createSession("user-1");

    expect(mocks.cookieSet).toHaveBeenCalledWith(expect.objectContaining({
      name: "ff_session",
      expires: new Date("2026-09-21T00:00:00.000Z"),
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    }));
  });

  it("rejects an expired session", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-token" });
    mocks.sessionFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1),
      user: activeUser,
    });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("rejects a session for a disabled user", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-token" });
    mocks.sessionFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...activeUser, isActive: false },
    });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns the owning user for a valid session", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-token" });
    mocks.sessionFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });

    await expect(getCurrentUser()).resolves.toEqual(activeUser);
    expect(mocks.sessionFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: createHash("sha256").update("raw-token").digest("hex") },
      include: { user: true },
    });
  });

  it("returns null without querying when the cookie is absent", async () => {
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.sessionFindUnique).not.toHaveBeenCalled();
  });

  it("deletes the hashed session and browser cookie", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-token" });
    mocks.sessionDeleteMany.mockResolvedValue({ count: 1 });

    await destroySession();

    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({
      where: { tokenHash: createHash("sha256").update("raw-token").digest("hex") },
    });
    expect(mocks.cookieDelete).toHaveBeenCalledWith("ff_session");
  });
});
