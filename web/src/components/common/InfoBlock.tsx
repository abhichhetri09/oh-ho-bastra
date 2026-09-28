import type { ReactNode } from "react";

import { Eyebrow } from "@/components/ui/eyebrow";

/** A titled block of short lines, e.g. "Ship to" or "Contact". */
export function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1 border-t pt-4 first:border-t-0 first:pt-0">
      <Eyebrow className="mb-2">{title}</Eyebrow>
      {children}
    </div>
  );
}
