import { ChoiceGroup } from "@/components/ui/choice-group";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { Variant } from "@/features/catalog/types";
import { formatPrice } from "@/lib/format";

export function SizePicker({
  variants,
  value,
  onChange,
}: {
  variants: Variant[];
  value: string | undefined;
  onChange: (size: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Eyebrow>Size</Eyebrow>
      <ChoiceGroup
        name="size"
        value={value}
        onChange={onChange}
        choices={variants.map(({ size, stock, priceCents }) => ({
          value: size,
          label: size,
          disabled: stock === 0,
          ariaLabel: `${size}, ${formatPrice(priceCents)}${stock === 0 ? ", sold out" : ""}`,
        }))}
      />
    </div>
  );
}
