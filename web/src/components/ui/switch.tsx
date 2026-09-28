import { cn } from "@/lib/utils";

/** Accessible on/off switch (a styled checkbox with role="switch"). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("relative inline-flex cursor-pointer items-center", disabled && "cursor-not-allowed opacity-50", className)}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2" />
      <span className="absolute left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-4" />
    </label>
  );
}
