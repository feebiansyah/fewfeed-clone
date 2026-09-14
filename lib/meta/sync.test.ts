import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findConnection: vi.fn(),
  updateConnection: vi.fn(),
  pageUpsert: vi.fn(),
  pageUpdateMany: vi.fn(),
  adAccountUpsert: vi.fn(),
  adAccountUpdateMany: vi.fn(),
  businessUpsert: vi.fn(),
  businessUpdateMany: vi.fn(),
  transaction: vi.fn(),
  decryptSecret: vi.fn(),
  metaFetch: vi.fn(),
}));

const transactionClient = {
  metaConnection: { update: mocks.updateConnection },
  facebookPage: { upsert: mocks.pageUpsert, updateMany: mocks.pageUpdateMany },
  adAccount: { upsert: mocks.adAccountUpsert, updateMany: mocks.adAccountUpdateMany },
  businessManager: { upsert: mocks.businessUpsert, updateMany: mocks.businessUpdateMany },
};

vi.mock("@/lib/db", () => ({
  db: {
    metaConnection: { findUnique: mocks.findConnection },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/security/secrets", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/meta/client", () => ({ metaFetch: mocks.metaFetch }));

import { syncMetaAssets } from "@/lib/meta/sync";

function endpointData(path: string) {
  if (path.startsWith("/me/accounts?")) {
    return { data: [{ id: "page-1", name: "Page One", tasks: ["CREATE_CONTENT"] }] };
  }
  if (path.startsWith("/me/adaccounts?")) {
    return {
      data: [{
        id: "act_101",
        account_id: "101",
        name: "Ads One",
        account_status: 1,
        business: { id: "business-embedded", name: "Embedded Business" },
      }],
    };
  }
  if (path.startsWith("/me/businesses?")) {
    return { data: [{ id: "business-1", name: "Business One" }] };
  }
  throw new Error(`Unexpected path: ${path}`);
}

describe("syncMetaAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.findConnection.mockResolvedValue({
      id: "connection-a",
      userId: "user-a",
      status: "CONNECTED",
      encryptedAccessToken: "encrypted-a",
    });
    mocks.decryptSecret.mockReturnValue("raw-token-a");
    mocks.metaFetch.mockImplementation(endpointData);
    mocks.transaction.mockImplementation(async (operation) => operation(transactionClient));
    for (const mock of [
      mocks.updateConnection,
      mocks.pageUpsert,
      mocks.pageUpdateMany,
      mocks.adAccountUpsert,
      mocks.adAccountUpdateMany,
      mocks.businessUpsert,
      mocks.businessUpdateMany,
    ]) {
      mock.mockResolvedValue({});
    }
  });

  it("decrypts only the current user's Meta token", async () => {
    await syncMetaAssets("user-a");

    expect(mocks.findConnection).toHaveBeenCalledWith({
      where: { userId: "user-a" },
      select: expect.objectContaining({ encryptedAccessToken: true }),
    });
    expect(mocks.decryptSecret).toHaveBeenCalledWith("encrypted-a");
    expect(mocks.metaFetch).toHaveBeenCalledWith(expect.any(String), {
      method: "GET",
      accessToken: "raw-token-a",
    });
  });

  it("syncs /me/accounts Pages", async () => {
    await syncMetaAssets("user-a");

    expect(mocks.pageUpsert).toHaveBeenCalledWith({
      where: { userId_pageId: { userId: "user-a", pageId: "page-1" } },
      create: expect.objectContaining({ userId: "user-a", pageId: "page-1", name: "Page One" }),
      update: expect.objectContaining({ name: "Page One", accessStatus: "AVAILABLE" }),
    });
  });

  it("syncs /me/adaccounts and preserves the existing default", async () => {
    await syncMetaAssets("user-a");

    expect(mocks.adAccountUpsert).toHaveBeenCalledWith({
      where: { userId_accountId: { userId: "user-a", accountId: "101" } },
      create: expect.objectContaining({ graphId: "act_101", accountStatus: 1, businessId: "business-embedded" }),
      update: expect.not.objectContaining({ isDefaultOneCard: expect.anything() }),
    });
  });

  it("syncs /me/businesses and reconciles embedded Ad Account businesses", async () => {
    const result = await syncMetaAssets("user-a");

    expect(mocks.businessUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.businessUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_businessId: { userId: "user-a", businessId: "business-embedded" } },
    }));
    expect(result.businesses).toBe(2);
  });

  it("follows Meta pagination until exhausted", async () => {
    mocks.metaFetch.mockImplementation((path: string) => {
      if (path === "/me/accounts?fields=id%2Cname%2Ctasks") {
        return { data: [{ id: "page-1", name: "Page One" }], paging: { cursors: { after: "cursor-2" }, next: "next" } };
      }
      if (path === "/me/accounts?fields=id%2Cname%2Ctasks&after=cursor-2") {
        return { data: [{ id: "page-2", name: "Page Two" }] };
      }
      return endpointData(path);
    });

    const result = await syncMetaAssets("user-a");

    expect(result.pages).toBe(2);
    expect(mocks.pageUpsert).toHaveBeenCalledTimes(2);
  });

  it("repeated sync updates rows instead of duplicating", async () => {
    await syncMetaAssets("user-a");
    await syncMetaAssets("user-a");

    expect(mocks.pageUpsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { userId_pageId: { userId: "user-a", pageId: "page-1" } },
    }));
  });

  it("updates changed names and statuses", async () => {
    mocks.metaFetch.mockImplementation((path: string) => {
      if (path.startsWith("/me/adaccounts?")) {
        return { data: [{ id: "act_101", account_id: "101", name: "Renamed Ads", account_status: 2 }] };
      }
      return endpointData(path);
    });

    await syncMetaAssets("user-a");

    expect(mocks.adAccountUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ name: "Renamed Ads", accountStatus: 2, accessStatus: "AVAILABLE" }),
    }));
  });

  it("marks missing assets STALE only after every remote fetch succeeds", async () => {
    await syncMetaAssets("user-a");

    expect(mocks.pageUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-a", pageId: { notIn: ["page-1"] } },
      data: { accessStatus: "STALE" },
    });
    expect(mocks.adAccountUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-a", accountId: { notIn: ["101"] } },
    }));
  });

  it("preserves previous good data when Meta fails partway", async () => {
    mocks.metaFetch.mockImplementation((path: string) => {
      if (path.startsWith("/me/adaccounts?")) throw new Error("remote failure containing raw-token-a");
      return endpointData(path);
    });

    await expect(syncMetaAssets("user-a")).rejects.toThrow("META_SYNC_FAILED");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.pageUpdateMany).not.toHaveBeenCalled();
    expect(mocks.pageUpsert).not.toHaveBeenCalled();
  });

  it("does not read or alter another user's tenant", async () => {
    await syncMetaAssets("user-a");

    const calls = JSON.stringify({
      find: mocks.findConnection.mock.calls,
      pages: mocks.pageUpsert.mock.calls,
      ads: mocks.adAccountUpsert.mock.calls,
      businesses: mocks.businessUpsert.mock.calls,
      stalePages: mocks.pageUpdateMany.mock.calls,
      staleAds: mocks.adAccountUpdateMany.mock.calls,
      staleBusinesses: mocks.businessUpdateMany.mock.calls,
    });
    expect(calls).toContain("user-a");
    expect(calls).not.toContain("user-b");
  });
});
