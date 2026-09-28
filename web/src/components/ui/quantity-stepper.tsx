import { Minus, Plus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Going below min is allowed when min is 0, e.g. to remove a cart line. */
  min?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center overflow-hidden rounded-md border", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-none"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease quantity"
      >
        <Minus />
      </Button>
      <span className="w-9 text-center text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-none"
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
      >
        <Plus />
      </Button>
    </div>
  );
}
