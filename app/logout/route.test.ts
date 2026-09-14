import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ destroySession: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  destroySession: mocks.destroySession,
}));

import { POST } from "@/app/logout/route";

describe("POST /logout", () => {
  it("destroys the session and redirects with a POST-safe 303", async () => {
    mocks.destroySession.mockResolvedValue(undefined);

    const response = await POST(new Request("http://localhost:3000/logout", { method: "POST" }));

    expect(mocks.destroySession).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });
});
