import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  description,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl space-y-3", className)}>
      {kicker ? (
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {kicker}
        </p>
      ) : null}
      <h1 className="font-serif text-4xl font-medium tracking-tight md:text-5xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}
