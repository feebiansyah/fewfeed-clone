"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setDefaultAdAccount } from "@/app/dashboard/actions";

export type DashboardAdAccount = {
  id: string;
  accountId: string;
  name: string;
  accountStatus: number | null;
  accessStatus: "AVAILABLE" | "STALE";
  isDefaultOneCard: boolean;
};

export function DefaultAdAccountForm({ accounts }: { accounts: DashboardAdAccount[] }) {
  return (
    <div className="space-y-3">
      {accounts.map((account) => (
        <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
          <div>
            <p className="font-medium text-slate-900">{account.name}</p>
            <p className="text-sm text-slate-500">
              {account.accountId} · {account.accessStatus} · Status {account.accountStatus ?? "unknown"}
            </p>
          </div>
          {account.isDefaultOneCard ? (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              Current default
            </span>
          ) : (
            <form action={setDefaultAdAccount.bind(null, account.id)}>
              <button
                type="submit"
                disabled={account.accessStatus !== "AVAILABLE"}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Set as default
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

export function SyncMetaButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");

  async function sync() {
    setStatus("syncing");
    try {
      const response = await fetch("/api/meta/sync", { method: "POST" });
      if (!response.ok) throw new Error("sync failed");
      setStatus("idle");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={sync}
        disabled={status === "syncing"}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {status === "syncing" ? "Syncing..." : "Sync Meta"}
      </button>
      {status === "error" ? <span className="text-sm text-red-700">Sync failed. Try again.</span> : null}
    </div>
  );
}
