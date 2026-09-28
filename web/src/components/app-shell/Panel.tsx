import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Bordered card section. `flush` drops body padding for tables and lists. */
export function Panel({
  title,
  description,
  actions,
  footer,
  flush = false,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={cn(!flush && "p-4")}>{children}</div>
      {footer ? <footer className="border-t">{footer}</footer> : null}
    </section>
  );
}
