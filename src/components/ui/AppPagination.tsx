import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function buildPages(current: number, total: number): (number | "...")[] {
  if (total <= 1) return [1];
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "...")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    const next = sorted[i + 1];
    if (next !== undefined && next - sorted[i] > 1) out.push("...");
  }
  return out;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);
  const pages = buildPages(safePage, totalPages);

  return (
    <div className={cn("mt-4", className)}>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage === 1}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2 py-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Précédent
        </button>

        {pages.map((p, idx) =>
          p === "..." ? (
            <span
              key={`e-${idx}`}
              className="px-2 py-1 text-sm text-muted-foreground select-none"
            >
              …
            </span>
          ) : p === safePage ? (
            <span
              key={p}
              aria-current="page"
              className="bg-primary text-primary-foreground font-medium rounded px-3 py-1 cursor-default text-sm"
            >
              {p}
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className="text-sm text-muted-foreground hover:bg-muted rounded px-3 py-1 transition-colors cursor-pointer"
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage === totalPages}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2 py-1"
        >
          Suivant
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="text-sm text-muted-foreground text-center mt-2">
        Affichage {from}–{to} sur {totalItems} résultats
      </div>
    </div>
  );
}

export default Pagination;
