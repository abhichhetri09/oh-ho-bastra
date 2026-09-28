import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The bordered side column on bag, checkout and order pages. */
export function SummaryPanel({
  children,
  sticky = true,
  className,
}: {
  children: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "h-fit space-y-6 rounded-xl border p-6 text-sm",
        sticky && "lg:sticky lg:top-24",
        className,
      )}
    >
      {children}
    </aside>
  );
}

/** Main column + summary column layout used by those same pages. */
export function WithSummary({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-12 lg:grid-cols-[1fr_20rem]", className)}>{children}</div>
  );
}
