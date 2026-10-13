"use client";

import { ArrowDownIcon, ArrowUpIcon } from "@phosphor-icons/react";
import type { SortDir } from "@repo/types";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A column header that sorts the table: the first click sorts by the column
 * in its natural direction, the next flips it. `isDefault` marks the column
 * the table is sorted by when no sort is set.
 */
export function SortableHead<F extends string>({
  field,
  label,
  sort,
  dir,
  natural = "desc",
  isDefault = false,
  onSort,
  className,
}: {
  field: F;
  label: string;
  sort: F | "";
  dir: SortDir;
  natural?: SortDir;
  isDefault?: boolean;
  onSort: (sort: F, dir: SortDir) => void;
  className?: string;
}) {
  const active = sort === field || (sort === "" && isDefault);
  const current: SortDir = sort === "" ? "desc" : dir;
  const Arrow = current === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead
      aria-sort={
        active ? (current === "asc" ? "ascending" : "descending") : "none"
      }
      className={className}
    >
      <button
        type="button"
        onClick={() =>
          onSort(field, active ? (current === "asc" ? "desc" : "asc") : natural)
        }
        className={cn(
          "group/sort -mx-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase transition-colors hover:text-foreground",
          active && "text-foreground",
          className?.includes("text-right") && "flex-row-reverse",
        )}
      >
        {label}
        <Arrow
          weight="bold"
          className={cn(
            "size-3 transition-opacity",
            active ? "opacity-100" : "opacity-0 group-hover/sort:opacity-40",
          )}
        />
      </button>
    </TableHead>
  );
}
