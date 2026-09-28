import { Panel } from "@/components/app-shell/Panel";
import { Plus, Trash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCollections } from "@/features/catalog/api";
import type { useProductForm } from "./useProductForm";

type Form = ReturnType<typeof useProductForm>;

export function DetailsSection({ form, slugPreview }: { form: Form; slugPreview?: string }) {
  const { data: collections = [] } = useCollections();
  const { draft, set } = form;
  return (
    <Panel title="Details">
      <div className="space-y-4">
        <FormField id="p-name" label="Name" required value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Heavyweight Tee — Olive" />
        {slugPreview ? <p className="-mt-2 text-xs text-muted-foreground">Shop link: /products/{slugPreview}</p> : null}
        <FormField id="p-description" label="Description">
          <Textarea id="p-description" rows={4} required value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </FormField>
        <FormField id="p-collection" label="Collection">
          <Select id="p-collection" value={draft.collection} onChange={(e) => set("collection", e.target.value)}>
            {collections.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
    </Panel>
  );
}

const specFields = [
  { key: "color", label: "Colour name", placeholder: "Olive" },
  { key: "fabric", label: "Cloth", placeholder: "100% cotton jersey" },
  { key: "fit", label: "Fit", placeholder: "Regular" },
  { key: "weight", label: "Weight", placeholder: "220 gsm" },
  { key: "care", label: "Care", placeholder: "Cold wash, inside out" },
] as const;

export function SpecsSection({ form }: { form: Form }) {
  return (
    <Panel title="Specs" description="Shown on the product page.">
      <div className="grid gap-4 sm:grid-cols-2">
        {specFields.map(({ key, ...props }) => (
          <FormField
            key={key}
            id={`p-${key}`}
            required
            {...props}
            className={key === "care" ? "sm:col-span-2" : undefined}
            value={form.draft[key]}
            onChange={(e) => form.set(key, e.target.value)}
          />
        ))}
      </div>
    </Panel>
  );
}

export function SizesSection({ form }: { form: Form }) {
  const { draft } = form;
  const perSize = draft.pricing === "per-size";
  const have = new Set(draft.sizes.map((s) => s.size.toUpperCase()));
  const quick = ["XS", "S", "M", "L", "XL", "XXL"].filter((s) => !have.has(s));
  return (
    <Panel
      title="Variants"
      description={
        perSize
          ? "Each size has its own price and stock. Saved sizes can’t be removed — set stock to 0 instead."
          : "Sizes and stock. Saved sizes can’t be removed — set stock to 0 instead."
      }
    >
      <div className="mb-2 hidden gap-2 text-xs text-muted-foreground sm:flex">
        <span className="w-24">Size</span>
        {perSize ? <span className="w-28">Price (€)</span> : null}
        <span className="w-28">Stock</span>
      </div>
      <div className="space-y-2">
        {draft.sizes.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Size ${index + 1}`}
              value={row.size}
              disabled={row.existing}
              placeholder="Size"
              className="w-24 uppercase"
              onChange={(e) => form.updateSize(index, { size: e.target.value })}
            />
            {perSize ? (
              <Input
                aria-label={`Price for ${row.size || `size ${index + 1}`}`}
                inputMode="decimal"
                placeholder="29,00"
                value={row.price}
                className="w-28 tabular-nums"
                onChange={(e) => form.updateSize(index, { price: e.target.value })}
              />
            ) : null}
            <Input
              aria-label={`Stock for ${row.size || `size ${index + 1}`}`}
              inputMode="numeric"
              value={row.stock}
              className="w-28 tabular-nums"
              onChange={(e) => form.updateSize(index, { stock: e.target.value })}
            />
            <span className="text-sm text-muted-foreground">in stock</span>
            {!row.existing ? (
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove size ${row.size}`} onClick={() => form.removeSize(index)}>
                <Trash />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => form.addSize()}>
          <Plus />
          Add size
        </Button>
        {quick.map((size) => (
          <Button key={size} type="button" variant="ghost" size="sm" onClick={() => form.addSize(size)}>
            + {size}
          </Button>
        ))}
      </div>
    </Panel>
  );
}

export function PricingSection({ form }: { form: Form }) {
  const { draft, set } = form;
  const perSize = draft.pricing === "per-size";
  return (
    <Panel title="Price & visibility" description="Prices include VAT.">
      <div className="space-y-4">
        <ChoiceGroup
          name="pricing"
          variant="card"
          value={draft.pricing}
          onChange={form.setPricing}
          className="[&>label]:p-3"
          choices={[
            { value: "same", label: "Same price for all sizes" },
            { value: "per-size", label: "Different price per size", description: "E.g. XXL costs more." },
          ]}
        />
        {perSize ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            Set each size’s price under Variants. The shop shows “from” the lowest one.
          </p>
        ) : (
          <FormField id="p-price" label="Price (€)" inputMode="decimal" placeholder="29,00" required value={draft.price} onChange={(e) => set("price", e.target.value)} />
        )}
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Visible in shop</p>
            <p className="text-xs text-muted-foreground">Hidden products stay on past orders.</p>
          </div>
          <Switch label="Visible in shop" checked={draft.active} onChange={(on) => set("active", on)} />
        </div>
      </div>
    </Panel>
  );
}
