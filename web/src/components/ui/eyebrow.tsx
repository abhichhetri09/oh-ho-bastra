import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The small uppercase label used above headings and data blocks. */
export function Eyebrow({
  as: Tag = "p",
  wide = false,
  className,
  children,
}: {
  as?: ElementType;
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "text-[11px] uppercase text-muted-foreground",
        wide ? "tracking-[0.22em]" : "tracking-[0.18em]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
