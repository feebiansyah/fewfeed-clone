import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), syncMetaAssets: vi.fn() }));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/meta/sync", () => ({ syncMetaAssets: mocks.syncMetaAssets }));

import { POST } from "@/app/api/meta/sync/route";

describe("POST /api/meta/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "authenticated-user" });
  });

  it("uses only the authenticated website user", async () => {
    mocks.syncMetaAssets.mockResolvedValue({
      pages: 1,
      adAccounts: 2,
      businesses: 3,
      syncedAt: new Date("2026-09-14T00:00:00.000Z"),
    });
    const request = new Request("http://localhost/api/meta/sync", {
      method: "POST",
      body: JSON.stringify({ userId: "attacker", accessToken: "browser-token" }),
    });

    const response = await POST(request);

    expect(mocks.syncMetaAssets).toHaveBeenCalledWith("authenticated-user");
    expect(mocks.syncMetaAssets).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({
      pages: 1,
      adAccounts: 2,
      businesses: 3,
      syncedAt: "2026-09-14T00:00:00.000Z",
    });
  });

  it("does not accept arbitrary user IDs or tokens from request input", async () => {
    mocks.syncMetaAssets.mockResolvedValue({ pages: 0, adAccounts: 0, businesses: 0, syncedAt: new Date(0) });
    const request = new Request("http://localhost/api/meta/sync?userId=attacker&accessToken=browser-token", {
      method: "POST",
    });

    await POST(request);

    expect(mocks.syncMetaAssets).toHaveBeenCalledWith("authenticated-user");
    expect(JSON.stringify(mocks.syncMetaAssets.mock.calls)).not.toContain("browser-token");
  });

  it("returns a safe error without credentials", async () => {
    mocks.syncMetaAssets.mockRejectedValue(new Error("raw-token browser-token encrypted-envelope"));

    const response = await POST(new Request("http://localhost/api/meta/sync", { method: "POST" }));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(502);
    expect(body).toBe('{"error":"META_SYNC_FAILED"}');
    expect(body).not.toContain("token");
    expect(body).not.toContain("encrypted-envelope");
  });
});
