import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { centsToInput, parseEuros } from "@/features/admin/price-input";
import type { SettingsResponse } from "@/features/admin/types";
import { formatPrice } from "@/lib/format";
import { SettingsCard } from "./SettingsCard";
import { useSettingsForm } from "./useSettingsForm";

type Props = { data: SettingsResponse };

export function StoreSection({ data }: Props) {
  const form = useSettingsForm("store", data.settings.store);
  const fields = [
    { key: "name", label: "Store name", autoComplete: "organization" },
    { key: "supportEmail", label: "Support email", type: "email" },
    { key: "phone", label: "Phone", type: "tel", placeholder: "+358 40 123 4567" },
    { key: "businessId", label: "Business ID (Y-tunnus)", placeholder: "1234567-8" },
  ] as const;
  return (
    <SettingsCard title="Store details" description="Shown to customers on receipts and the contact page." form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(({ key, ...props }) => (
          <FormField
            key={key}
            id={`store-${key}`}
            {...props}
            value={form.value[key]}
            onChange={(event) => form.update({ [key]: event.target.value })}
          />
        ))}
      </div>
    </SettingsCard>
  );
}

/** Euro amount input that keeps what the admin typed until it parses. */
function EuroInput({ id, cents, onChange, label }: { id: string; cents: number; onChange: (cents: number) => void; label: string }) {
  return (
    <div className="relative w-28">
      <Input
        id={id}
        aria-label={label}
        inputMode="decimal"
        defaultValue={centsToInput(cents)}
        onChange={(event) => {
          const parsed = parseEuros(event.target.value);
          if (parsed !== null) onChange(parsed);
        }}
        className="pr-7 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">€</span>
    </div>
  );
}

export function ShippingSection({ data }: Props) {
  const form = useSettingsForm("shipping", data.settings.shipping);
  const { options, freeShippingThresholdCents: freeFrom } = form.value;
  const setOption = (id: string, patch: Partial<{ enabled: boolean; priceCents: number }>) =>
    form.update({ options: { ...options, [id]: { ...options[id], ...patch } } });

  return (
    <SettingsCard title="Shipping" description="Which delivery options checkout offers, and what they cost (VAT included)." form={form}>
      <ul className="divide-y rounded-md border">
        {data.catalog.shippingOptions.map((option) => {
          const config = options[option.id] ?? { enabled: true, priceCents: option.priceCents };
          return (
            <li key={option.id} className="flex flex-wrap items-center gap-4 p-4">
              <Switch label={`Offer ${option.name}`} checked={config.enabled} onChange={(enabled) => setOption(option.id, { enabled })} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{option.name}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
              <EuroInput
                key={form.version}
                id={`ship-${option.id}`}
                label={`${option.name} price`}
                cents={config.priceCents}
                onChange={(priceCents) => setOption(option.id, { priceCents })}
              />
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-4 rounded-md border p-4">
        <Switch
          label="Free shipping over a set amount"
          checked={freeFrom !== null}
          onChange={(on) => form.update({ freeShippingThresholdCents: on ? 6000 : null })}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Free shipping</p>
          <p className="text-xs text-muted-foreground">
            {freeFrom === null ? "Off. Every order pays for shipping." : `Orders of ${formatPrice(freeFrom)} or more ship free.`}
          </p>
        </div>
        {freeFrom !== null ? (
          <EuroInput
            key={form.version}
            id="free-shipping"
            label="Free shipping threshold"
            cents={freeFrom}
            onChange={(cents) => form.update({ freeShippingThresholdCents: cents })}
          />
        ) : null}
      </div>
    </SettingsCard>
  );
}

const groupLabels: Record<string, string> = { bank: "Online bank", mobile: "Mobile", card: "Card", credit: "Pay later" };

export function PaymentsSection({ data }: Props) {
  const form = useSettingsForm("payments", data.settings.payments);
  const enabled = new Set(form.value.enabledMethods);
  const toggle = (id: string, on: boolean) =>
    form.update({ enabledMethods: data.catalog.paymentMethods.map((m) => m.id).filter((m) => (m === id ? on : enabled.has(m))) });
  const groups = [...new Set(data.catalog.paymentMethods.map((m) => m.group))];

  return (
    <SettingsCard title="Payment methods" description="Choose which methods customers see at checkout." form={form}>
      <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
        Provider: <span className="font-medium text-foreground">{data.paymentProvider === "mock" ? "Paytrail (test mode)" : data.paymentProvider}</span>
        {data.paymentProvider === "mock" ? " — payments are simulated and no money moves." : null}
      </p>
      {groups.map((group) => (
        <fieldset key={group} className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{groupLabels[group] ?? group}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.catalog.paymentMethods
              .filter((m) => m.group === group)
              .map((method) => (
                <div key={method.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                  <span className="text-sm">{method.name}</span>
                  <Switch label={`Offer ${method.name}`} checked={enabled.has(method.id)} onChange={(on) => toggle(method.id, on)} />
                </div>
              ))}
          </div>
        </fieldset>
      ))}
    </SettingsCard>
  );
}

export function InventorySection({ data }: Props) {
  const form = useSettingsForm("inventory", data.settings.inventory);
  return (
    <SettingsCard title="Inventory" description="When a size counts as running low on the dashboard." form={form}>
      <FormField
        id="low-stock"
        label="Low-stock threshold (units per size)"
        type="number"
        min={0}
        max={1000}
        className="max-w-56"
        value={String(form.value.lowStockThreshold)}
        onChange={(event) => form.update({ lowStockThreshold: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
      />
    </SettingsCard>
  );
}
