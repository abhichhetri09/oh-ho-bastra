import { Droplets, Ruler, Shirt, Weight, type LucideIcon } from "@/components/icons";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { Product } from "@/features/catalog/types";

const specs: { key: keyof Product; label: string; icon: LucideIcon }[] = [
  { key: "fabric", label: "Cloth", icon: Shirt },
  { key: "fit", label: "Fit", icon: Ruler },
  { key: "weight", label: "Weight", icon: Weight },
  { key: "care", label: "Care", icon: Droplets },
];

export function ProductSpecs({ product }: { product: Product }) {
  return (
    <dl className="grid max-w-md grid-cols-2 gap-x-8 gap-y-5 border-y py-8 text-sm">
      {specs.map(({ key, label, icon: Icon }) => (
        <div key={key}>
          <Eyebrow as="dt" className="flex items-center gap-1.5">
            <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />
            {label}
          </Eyebrow>
          <dd className="mt-1">{String(product[key])}</dd>
        </div>
      ))}
    </dl>
  );
}
