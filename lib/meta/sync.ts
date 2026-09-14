import { db } from "@/lib/db";
import { metaFetch } from "@/lib/meta/client";
import { decryptSecret } from "@/lib/security/secrets";

const PAGE_PATH = "/me/accounts?fields=id%2Cname%2Ctasks";
const AD_ACCOUNT_PATH = "/me/adaccounts?fields=id%2Caccount_id%2Cname%2Caccount_status%2Cbusiness%7Bid%2Cname%7D";
const BUSINESS_PATH = "/me/businesses?fields=id%2Cname";

type Paging = {
  next?: string;
  cursors?: { after?: string };
};

type GraphPage<T> = {
  data: T[];
  paging?: Paging;
};

type PageAsset = {
  id: string;
  name: string;
  tasks?: string[];
};

type BusinessAsset = {
  id: string;
  name: string;
};

type AdAccountAsset = {
  id: string;
  account_id: string;
  name: string;
  account_status?: number;
  business?: BusinessAsset;
};

export type SyncSummary = {
  pages: number;
  adAccounts: number;
  businesses: number;
  syncedAt: Date;
};

export class MetaSyncError extends Error {
  readonly safeCode: "META_CONNECTION_REQUIRED" | "META_SYNC_FAILED";

  constructor(safeCode: "META_CONNECTION_REQUIRED" | "META_SYNC_FAILED") {
    super(safeCode);
    this.name = "MetaSyncError";
    this.safeCode = safeCode;
  }
}

function cursorFromPaging(paging: Paging | undefined): string | null {
  if (!paging?.next) return null;
  if (paging.cursors?.after) return paging.cursors.after;

  try {
    const next = new URL(paging.next);
    if (next.hostname !== "graph.facebook.com") return null;
    return next.searchParams.get("after");
  } catch {
    return null;
  }
}

async function fetchAll<T>(basePath: string, accessToken: string): Promise<T[]> {
  const assets: T[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();

  do {
    const path = cursor
      ? `${basePath}&after=${encodeURIComponent(cursor)}`
      : basePath;
    const response = await metaFetch<GraphPage<T>>(path, {
      method: "GET",
      accessToken,
    });
    if (!Array.isArray(response.data)) {
      throw new MetaSyncError("META_SYNC_FAILED");
    }
    assets.push(...response.data);

    cursor = cursorFromPaging(response.paging);
    if (cursor && seenCursors.has(cursor)) {
      throw new MetaSyncError("META_SYNC_FAILED");
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  return assets;
}

export async function syncMetaAssets(userId: string): Promise<SyncSummary> {
  const connection = await db.metaConnection.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      encryptedAccessToken: true,
    },
  });
  if (!connection || connection.status !== "CONNECTED") {
    throw new MetaSyncError("META_CONNECTION_REQUIRED");
  }

  let pages: PageAsset[];
  let adAccounts: AdAccountAsset[];
  let listedBusinesses: BusinessAsset[];
  try {
    const accessToken = decryptSecret(connection.encryptedAccessToken);
    [pages, adAccounts, listedBusinesses] = await Promise.all([
      fetchAll<PageAsset>(PAGE_PATH, accessToken),
      fetchAll<AdAccountAsset>(AD_ACCOUNT_PATH, accessToken),
      fetchAll<BusinessAsset>(BUSINESS_PATH, accessToken),
    ]);
  } catch {
    throw new MetaSyncError("META_SYNC_FAILED");
  }

  const businesses = new Map<string, BusinessAsset>();
  for (const business of listedBusinesses) businesses.set(business.id, business);
  for (const account of adAccounts) {
    if (account.business) businesses.set(account.business.id, account.business);
  }

  const syncedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      for (const page of pages) {
        await tx.facebookPage.upsert({
          where: { userId_pageId: { userId, pageId: page.id } },
          create: {
            userId,
            metaConnectionId: connection.id,
            pageId: page.id,
            name: page.name,
            accessStatus: "AVAILABLE",
            lastSeenAt: syncedAt,
          },
          update: {
            metaConnectionId: connection.id,
            name: page.name,
            accessStatus: "AVAILABLE",
            lastSeenAt: syncedAt,
          },
        });
      }

      for (const account of adAccounts) {
        await tx.adAccount.upsert({
          where: { userId_accountId: { userId, accountId: account.account_id } },
          create: {
            userId,
            metaConnectionId: connection.id,
            accountId: account.account_id,
            graphId: account.id,
            name: account.name,
            accountStatus: account.account_status ?? null,
            businessId: account.business?.id ?? null,
            accessStatus: "AVAILABLE",
            lastSeenAt: syncedAt,
          },
          update: {
            metaConnectionId: connection.id,
            graphId: account.id,
            name: account.name,
            accountStatus: account.account_status ?? null,
            businessId: account.business?.id ?? null,
            accessStatus: "AVAILABLE",
            lastSeenAt: syncedAt,
          },
        });
      }

      for (const business of businesses.values()) {
        await tx.businessManager.upsert({
          where: { userId_businessId: { userId, businessId: business.id } },
          create: {
            userId,
            metaConnectionId: connection.id,
            businessId: business.id,
            name: business.name,
            accessStatus: "AVAILABLE",
            lastSeenAt: syncedAt,
          },
          update: {
            metaConnectionId: connection.id,
            name: business.name,
            accessStatus: "AVAILABLE",
            lastSeenAt: syncedAt,
          },
        });
      }

      await tx.facebookPage.updateMany({
        where: { userId, pageId: { notIn: pages.map((page) => page.id) } },
        data: { accessStatus: "STALE" },
      });
      await tx.adAccount.updateMany({
        where: { userId, accountId: { notIn: adAccounts.map((account) => account.account_id) } },
        data: { accessStatus: "STALE" },
      });
      await tx.businessManager.updateMany({
        where: { userId, businessId: { notIn: [...businesses.keys()] } },
        data: { accessStatus: "STALE" },
      });
      await tx.metaConnection.update({
        where: { userId },
        data: { lastSyncAt: syncedAt, lastErrorCode: null },
      });
    });
  } catch {
    throw new MetaSyncError("META_SYNC_FAILED");
  }

  return {
    pages: pages.length,
    adAccounts: adAccounts.length,
    businesses: businesses.size,
    syncedAt,
  };
}
