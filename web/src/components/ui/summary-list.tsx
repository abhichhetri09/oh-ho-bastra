import type { ReactNode } from "react";

import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";

export type SummaryRow = {
  label: ReactNode;
  value: ReactNode;
  /** Large total row with a rule above it. */
  total?: boolean;
  /** Small, muted footnote row (e.g. VAT share). */
  note?: boolean;
};

/** Label/value rows: order totals, key facts, timestamps. */
export function SummaryList({ rows, className }: { rows: SummaryRow[]; className?: string }) {
  return (
    <dl className={cn("space-y-2 text-sm", className)}>
      {rows.map((row, index) => (
        <div
          key={index}
          className={cn(
            "flex justify-between gap-4",
            row.total && "items-baseline border-t pt-3",
            row.note && "text-xs text-muted-foreground",
          )}
        >
          <dt className={cn(!row.note && !row.total && "text-muted-foreground")}>
            {row.total ? <Eyebrow as="span">{row.label}</Eyebrow> : row.label}
          </dt>
          <dd className={cn("text-right tabular-nums", row.total && "font-serif text-2xl")}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
