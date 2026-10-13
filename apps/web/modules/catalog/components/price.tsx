import { formatPriceShort, percentOff } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * A storefront price. `price` is what the customer pays; with an active
 * offer the selling price is struck through beside it in the clay accent.
 */
export function Price({
  price,
  selling,
  offer,
  showSaving = false,
  className,
}: {
  price: number;
  selling: number;
  offer: number | null;
  /** Adds "Save 22%" after an offer price. */
  showSaving?: boolean;
  className?: string;
}) {
  const onOffer = offer !== null && offer < selling;

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-baseline gap-x-2 tabular-nums",
        className,
      )}
    >
      <span className={cn(onOffer && "text-clay")}>
        {onOffer && <span className="sr-only">Now </span>}
        {formatPriceShort(price)}
      </span>
      {onOffer && (
        <span className="text-[0.85em] text-muted-foreground line-through decoration-[0.5px]">
          <span className="sr-only">was </span>
          {formatPriceShort(selling)}
        </span>
      )}
      {onOffer && showSaving && (
        <span className="eyebrow !text-clay">
          Save {percentOff(selling, offer)}%
        </span>
      )}
    </span>
  );
}
