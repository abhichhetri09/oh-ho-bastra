import type { InputHTMLAttributes, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  id: string;
  label: string;
  className?: string;
  /** Custom control (textarea, select…). Defaults to an Input with the rest of the props. */
  children?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "children">;

export function FormField({ id, label, className, children, ...inputProps }: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children ?? <Input id={id} name={id} {...inputProps} />}
    </div>
  );
}
