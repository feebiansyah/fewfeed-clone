import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCurrentUser: vi.fn(),
  findConnection: vi.fn(),
  upsertConnection: vi.fn(),
  createOAuthState: vi.fn(),
  consumeOAuthState: vi.fn(),
  buildMetaOAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  getMetaIdentity: vi.fn(),
  encryptSecret: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    metaConnection: {
      findUnique: mocks.findConnection,
      upsert: mocks.upsertConnection,
    },
  },
}));
vi.mock("@/lib/meta/oauth", () => ({
  createOAuthState: mocks.createOAuthState,
  consumeOAuthState: mocks.consumeOAuthState,
  buildMetaOAuthUrl: mocks.buildMetaOAuthUrl,
  exchangeCodeForAccessToken: mocks.exchangeCode,
  getMetaIdentity: mocks.getMetaIdentity,
}));
vi.mock("@/lib/security/secrets", () => ({ encryptSecret: mocks.encryptSecret }));

import { GET as callback } from "@/app/api/meta/callback/route";
import { GET as connect } from "@/app/api/meta/connect/route";

describe("Meta OAuth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  });

  it("refuses an existing connected account unless reconnect is explicit", async () => {
    mocks.findConnection.mockResolvedValue({ status: "CONNECTED" });

    const response = await connect(new Request("http://localhost:3000/api/meta/connect"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard?meta=already_connected");
    expect(mocks.createOAuthState).not.toHaveBeenCalled();
  });

  it("validates callback state before exchanging the authorization code", async () => {
    mocks.consumeOAuthState.mockResolvedValue(false);

    const response = await callback(new Request("http://localhost:3000/api/meta/callback?state=bad&code=secret-code"));

    expect(mocks.consumeOAuthState).toHaveBeenCalledWith("bad", "user-1");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard?meta=error");
  });

  it("encrypts the token and stores the current user's connection", async () => {
    mocks.consumeOAuthState.mockResolvedValue(true);
    mocks.exchangeCode.mockResolvedValue({
      accessToken: "raw-meta-token",
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    mocks.getMetaIdentity.mockResolvedValue({ id: "meta-1", name: "Meta User" });
    mocks.encryptSecret.mockReturnValue("encrypted-envelope");
    mocks.upsertConnection.mockResolvedValue({});

    const response = await callback(new Request("http://localhost:3000/api/meta/callback?state=valid&code=secret-code"));

    expect(mocks.encryptSecret).toHaveBeenCalledWith("raw-meta-token");
    expect(mocks.upsertConnection).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: expect.objectContaining({
        userId: "user-1",
        metaUserId: "meta-1",
        encryptedAccessToken: "encrypted-envelope",
        status: "CONNECTED",
      }),
      update: expect.objectContaining({
        metaUserId: "meta-1",
        encryptedAccessToken: "encrypted-envelope",
        status: "CONNECTED",
      }),
    });
    expect(JSON.stringify(mocks.upsertConnection.mock.calls)).not.toContain("raw-meta-token");
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard?meta=connected");
    expect(await response.text()).not.toContain("raw-meta-token");
    expect(await response.text()).not.toContain("secret-code");
  });
});
