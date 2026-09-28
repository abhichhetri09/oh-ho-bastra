import type { ReactNode } from "react";

import { Eyebrow } from "@/components/ui/eyebrow";

export function CheckoutSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t pt-8">
      {/* Floated so the legend sits inside the fieldset rather than on its border. */}
      <Eyebrow as="legend" className="float-left mb-5 w-full">
        {title}
      </Eyebrow>
      {/* Grids next to a float shrink beside it instead of wrapping below; clear it. */}
      <div className="clear-both space-y-5">{children}</div>
    </fieldset>
  );
}
