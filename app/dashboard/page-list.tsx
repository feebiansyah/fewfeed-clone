"use client";

import { useDeferredValue, useMemo, useState } from "react";

export type DashboardPageItem = {
  id: string;
  pageId: string;
  name: string;
  accessStatus: "AVAILABLE" | "STALE";
};

export function PageList({ pages }: { pages: DashboardPageItem[] }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const visiblePages = useMemo(() => {
    if (!deferredQuery) return pages;
    return pages.filter((page) =>
      page.name.toLowerCase().includes(deferredQuery)
      || page.pageId.toLowerCase().includes(deferredQuery));
  }, [deferredQuery, pages]);

  return (
    <div className="space-y-4">
      <label className="block max-w-md text-sm font-medium text-slate-700">
        Search Fanpages
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or Page ID"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <p className="text-sm text-slate-500" aria-live="polite">
        Showing {visiblePages.length} of {pages.length} Fanpages
      </p>

      {visiblePages.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visiblePages.map((page) => (
            <li key={page.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-950">{page.name}</h3>
                  <p className="mt-1 break-all text-sm text-slate-500">Page ID: {page.pageId}</p>
                </div>
                <span className={page.accessStatus === "AVAILABLE"
                  ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                  : "rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"}
                >
                  {page.accessStatus}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
          No Fanpages match this search.
        </p>
      )}
    </div>
  );
}
