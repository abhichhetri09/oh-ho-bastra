import { StarIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

/**
 * Five stars filled to `value` (fractions too), for display. Screen readers
 * hear "Rated 4.3 out of 5".
 */
export function Stars({
  value,
  className,
  size = "size-3.5",
}: {
  value: number;
  className?: string;
  size?: string;
}) {
  const fill = Math.max(0, Math.min(5, value)) * 20;
  return (
    <span
      role="img"
      aria-label={`Rated ${value.toFixed(1)} out of 5`}
      className={cn("relative inline-flex", className)}
    >
      <span className="flex text-border" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon key={i} weight="fill" className={size} />
        ))}
      </span>
      <span
        className="absolute inset-y-0 left-0 flex overflow-hidden text-foreground"
        style={{ width: `${fill}%` }}
        aria-hidden
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon key={i} weight="fill" className={cn(size, "shrink-0")} />
        ))}
      </span>
    </span>
  );
}
