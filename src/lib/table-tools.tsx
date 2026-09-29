import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

// String.localeCompare with a locale builds a new collator on every call, which makes
// sorting large tables dozens of times slower. Reuse a single instance instead.
const collator = new Intl.Collator("pt-BR", { numeric: true });

export type SortDir = "asc" | "desc";
export type SortValue = string | number | null | undefined;
export type Accessors<T> = Record<string, (row: T) => SortValue>;

export function useSort<T>(defaultKey: string | null = null, defaultDir: SortDir = "asc") {
  const [sort, setSort] = useState<{ key: string | null; dir: SortDir }>({
    key: defaultKey,
    dir: defaultDir,
  });

  function toggle(key: string) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  function sorted(rows: T[], accessors: Accessors<T>): T[] {
    const key = sort.key;
    if (!key) return rows;
    const get = accessors[key];
    if (!get) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return collator.compare(String(av), String(bv)) * factor;
    });
  }

  return { sort, toggle, sorted };
}

export function SortableTh({
  label,
  sortKey,
  sort,
  onToggle,
  align = "left",
  className,
}: {
  label: string;
  sortKey: string;
  sort: { key: string | null; dir: SortDir };
  onToggle: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        "px-4 py-3",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-widest transition-colors hover:text-foreground",
          active && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-40")} />
      </button>
    </th>
  );
}

/** Slices `rows` into pages. Call `reset()` when filters or sorting change. */
export function usePagination<T>(rows: T[], pageSize = 50) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;

  return {
    page: current,
    pageCount,
    total: rows.length,
    start,
    pageRows: rows.slice(start, start + pageSize),
    setPage,
    reset: () => setPage(1),
  };
}

export function Pagination({
  page,
  pageCount,
  total,
  start,
  pageSize,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  start: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const t = useT();
  if (pageCount <= 1) return null;
  const end = Math.min(start + pageSize, total);
  const buttonClass =
    "inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted-foreground">
      <span className="tabular">
        {t("{from}–{to} de {total}", { from: start + 1, to: end, total })}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" /> {t("Anterior")}
        </button>
        <span className="tabular">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className={buttonClass}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          {t("Próxima")} <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export async function exportToExcel(
  filename: string,
  sheetName: string,
  rows: Record<string, string | number | null>[],
) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filename}-${stamp}.xlsx`);
}
