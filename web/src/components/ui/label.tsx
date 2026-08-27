import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentPropsWithoutRef, ComponentRef, Ref } from "react";

import { cn } from "@/lib/utils";

function Label({
  className,
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
  ref?: Ref<ComponentRef<typeof LabelPrimitive.Root>>;
}) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
