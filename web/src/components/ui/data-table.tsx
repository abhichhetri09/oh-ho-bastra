import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "right";
  /** Hide on narrow screens to keep the table readable on phones. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

/** Config-driven table. With `rowHref`, whole rows are clickable (links inside still work). */
export function DataTable<T>({
  columns,
  rows,
  getKey,
  rowHref,
  empty = "Nothing here yet.",
  dense = false,
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: ReactNode;
  dense?: boolean;
}) {
  const navigate = useNavigate();
  const cellClass = (column: Column<T>) =>
    cn(
      "px-4",
      dense ? "py-2.5" : "py-3",
      column.align === "right" && "text-right",
      column.hideBelow && hide[column.hideBelow],
      column.className,
    );

  if (rows.length === 0) {
    return <p className="px-4 py-12 text-center text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn(cellClass(column), "py-2.5 font-medium")}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={getKey(row)}
                onClick={href ? (event) => !(event.target as HTMLElement).closest("a,button") && void navigate(href) : undefined}
                className={cn("transition-colors", href && "cursor-pointer hover:bg-muted/50")}
              >
                {columns.map((column) => (
                  <td key={column.key} className={cellClass(column)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
