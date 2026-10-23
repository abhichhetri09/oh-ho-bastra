import { ChoiceGroup } from "@/components/ui/choice-group";
import { shippingCost, type ShippingOption } from "@/features/checkout/types";
import { formatPrice } from "@/lib/format";

export function ShippingPicker({
  options,
  value,
  onChange,
  subtotalCents,
  freeFrom,
}: {
  options: ShippingOption[];
  value: string;
  onChange: (id: string) => void;
  subtotalCents: number;
  freeFrom: number | null;
}) {
  const remaining = freeFrom === null ? 0 : freeFrom - subtotalCents;
  return (
    <>
      {freeFrom !== null ? (
        <p className="text-sm text-muted-foreground">
          {remaining > 0
            ? `Add ${formatPrice(remaining)} more for free shipping.`
            : "Your order ships free."}
        </p>
      ) : null}
      <ChoiceGroup
      name="shippingMethod"
      variant="card"
      value={value}
      onChange={onChange}
      choices={options.map((option) => ({
        value: option.id,
        label: option.name,
        description: option.description,
        aside: (() => {
          const cost = shippingCost(option, subtotalCents, freeFrom);
          return cost === 0 ? "Free" : formatPrice(cost);
        })(),
      }))}
      />
    </>
  );
}
