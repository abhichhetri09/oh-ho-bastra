import type { ReactNode } from "react";

import type { LucideIcon } from "@/components/icons";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {Icon ? (
        <Icon
          className="mx-auto mb-5 size-8 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
      ) : null}
      <h2 className="font-serif text-3xl font-medium tracking-tight">{title}</h2>
      <p className="mt-3 leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}
