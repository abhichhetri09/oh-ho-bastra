import { FormField } from "@/components/ui/form-field";
import type { FieldConfig } from "@/features/checkout/fields";
import type { useCheckoutForm } from "@/features/checkout/useCheckoutForm";

type Bind = ReturnType<typeof useCheckoutForm>["bind"];

/** Renders a list of field configs as a two-column form grid. */
export function FieldGrid({ fields, bind }: { fields: FieldConfig[]; bind: Bind }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(({ field, label, wide, ...inputProps }) => (
        <FormField
          key={field}
          label={label}
          className={wide ? "sm:col-span-2" : undefined}
          {...inputProps}
          {...bind(field)}
        />
      ))}
    </div>
  );
}
