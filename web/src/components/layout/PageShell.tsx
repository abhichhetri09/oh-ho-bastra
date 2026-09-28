import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-6xl px-6 py-12 lg:px-10 lg:py-16",
        className,
      )}
    >
      {children}
    </div>
  );
}
