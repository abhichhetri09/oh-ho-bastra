import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Full-width bordered band with a centered content column. */
export function HomeSection({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-20 border-t px-6 py-16 lg:px-16 lg:py-24", className)}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}
