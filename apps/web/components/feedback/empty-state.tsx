import { cn } from "@/lib/utils";

/** A quiet, centred message for empty and error states. */
export function EmptyState({
  eyebrow,
  title,
  children,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-6 py-24 text-center",
        className,
      )}
    >
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="display max-w-lg text-4xl sm:text-5xl">{title}</h2>
      {children && (
        <div className="max-w-md text-sm text-muted-foreground">{children}</div>
      )}
      {action && (
        <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div>
      )}
    </div>
  );
}
