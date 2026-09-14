import Link from "next/link";

import {
  DefaultAdAccountForm,
  SyncMetaButton,
} from "@/app/dashboard/default-ad-account-form";
import { PageList } from "@/app/dashboard/page-list";
import { requireUser } from "@/lib/auth/require-user";
import { db } from "@/lib/db";

function formatSyncTime(value: Date | null): string {
  return value ? value.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [connection, pages, adAccounts] = await Promise.all([
    db.metaConnection.findUnique({
      where: { userId: user.id },
      select: {
        metaUserId: true,
        metaDisplayName: true,
        status: true,
        lastSyncAt: true,
      },
    }),
    db.facebookPage.findMany({
      where: { userId: user.id },
      select: { id: true, pageId: true, name: true, accessStatus: true },
      orderBy: { name: "asc" },
    }),
    db.adAccount.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        accountId: true,
        name: true,
        accountStatus: true,
        accessStatus: true,
        isDefaultOneCard: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const currentDefault = adAccounts.find((account) => account.isDefaultOneCard);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="auth-eyebrow">Internal Access</p>
          <h1 className="text-3xl font-bold text-slate-950">Fewfeed Clone</h1>
          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
        </div>
        <form action="/logout" method="post">
          <button type="submit" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">
            Logout
          </button>
        </form>
      </header>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Connected Facebook identity</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              {connection?.metaDisplayName ?? "Meta is not connected"}
            </h2>
            {connection ? (
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                <p>Meta user ID: {connection.metaUserId}</p>
                <p>Status: {connection.status}</p>
                <p>Last sync: {formatSyncTime(connection.lastSyncAt)}</p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={connection ? "/api/meta/connect?reconnect=1" : "/api/meta/connect"}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
            >
              {connection ? "Reconnect Meta" : "Connect Meta"}
            </Link>
            {connection?.status === "CONNECTED" ? <SyncMetaButton /> : null}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <p className="text-sm font-medium text-blue-700">Primary assets</p>
          <h2 className="text-2xl font-bold text-slate-950">Fanpages</h2>
          <p className="mt-1 text-sm text-slate-500">{pages.length} Page{pages.length === 1 ? "" : "s"} in this account</p>
        </div>
        <PageList pages={pages} />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Technical configuration</p>
            <h2 className="text-xl font-semibold text-slate-950">Ad Accounts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Current One Card default: {currentDefault?.name ?? "Not selected"}
            </p>
          </div>
          <Link href="/one-card" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
            One Card Preparation
          </Link>
        </div>
        {adAccounts.length ? (
          <DefaultAdAccountForm accounts={adAccounts} />
        ) : (
          <p className="text-sm text-slate-500">No Ad Accounts synchronized.</p>
        )}
      </section>
    </main>
  );
}
