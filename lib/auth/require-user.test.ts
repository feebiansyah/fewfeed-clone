import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT:/login");
  }),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requireUser } from "@/lib/auth/require-user";

describe("requireUser", () => {
  it("returns the current authenticated user", async () => {
    const user = { id: "user-1", isActive: true };
    mocks.getCurrentUser.mockResolvedValue(user);

    await expect(requireUser()).resolves.toBe(user);
  });

  it("redirects unauthenticated requests to login", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
