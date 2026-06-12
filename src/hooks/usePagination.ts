import { useEffect, useState } from "react";

/**
 * Generic client-side pagination helper with URL ?page= persistence
 * via window.history (no router schema change required).
 *
 * - Resets to page 1 when any value in `resetDeps` changes.
 * - Sync to URL via replaceState — won't pollute browser history.
 * - Pass `syncUrl: false` for local pagination (e.g. in dialogs / cards).
 */
export function usePagination<T>(
  items: readonly T[],
  resetDeps: ReadonlyArray<unknown>,
  options?: { pageSize?: number; syncUrl?: boolean },
) {
  const pageSize = options?.pageSize ?? 10;
  const syncUrl = options?.syncUrl ?? true;

  const [page, setPage] = useState(() => {
    if (!syncUrl || typeof window === "undefined") return 1;
    const p = Number(new URLSearchParams(window.location.search).get("page"));
    return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
  });

  // Reset to page 1 on filter/search change.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  // Persist current page in URL when enabled.
  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (page <= 1) url.searchParams.delete("page");
    else url.searchParams.set("page", String(page));
    const next = url.pathname + (url.search ? url.search : "") + url.hash;
    window.history.replaceState(window.history.state, "", next);
  }, [page, syncUrl]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const visible = items.slice(start, start + pageSize);

  return {
    page: safePage,
    setPage,
    pageSize,
    total,
    totalPages,
    visible,
  };
}
