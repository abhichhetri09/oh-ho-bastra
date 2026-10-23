import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useSaveAddress } from "@/features/account/api";
import type { SavedAddress } from "@/features/account/types";
import { addressFields } from "@/features/checkout/fields";

const empty: SavedAddress = { firstName: "", lastName: "", phone: "", street: "", postalCode: "", city: "" };

// Same fields as checkout, plus phone (which checkout asks for under Contact).
const fields = [
  ...addressFields,
  { field: "phone" as const, label: "Phone", type: "tel", autoComplete: "tel", placeholder: "+358 40 123 4567" },
];

export function AddressForm({
  initial,
  onDone,
}: {
  initial: SavedAddress | null;
  onDone: () => void;
}) {
  const [values, setValues] = useState<SavedAddress>(initial ?? empty);
  const save = useSaveAddress();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(values, { onSuccess: onDone });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(({ field, label, wide, ...inputProps }) => (
          <FormField
            key={field}
            id={`address-${field}`}
            label={label}
            className={wide ? "sm:col-span-2" : undefined}
            required
            {...inputProps}
            value={values[field as keyof SavedAddress] ?? ""}
            onChange={(event) => setValues((v) => ({ ...v, [field]: event.target.value }))}
          />
        ))}
      </div>
      {save.isError ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save address"}
        </Button>
        {initial ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
