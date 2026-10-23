import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, type Ref } from "react";

import { buttonVariants } from "./button-variants";
import { cn } from "@/lib/utils";


export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
}

export { Button };
