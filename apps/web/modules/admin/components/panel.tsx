import { cn } from "@/lib/utils";

/**
 * A titled card: the admin's building block for forms, details and the
 * dashboard. The header holds an optional hint (a count) and action.
 */
export function Panel({
  title,
  hint,
  action,
  id,
  children,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 rounded-panel border border-border bg-card",
        className,
      )}
    >
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-5 py-2">
        <h2 className="eyebrow !text-foreground">{title}</h2>
        <div className="flex items-center gap-3">
          {hint && (
            <span className="font-mono text-[0.625rem] text-muted-foreground tabular-nums">
              {hint}
            </span>
          )}
          {action}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
