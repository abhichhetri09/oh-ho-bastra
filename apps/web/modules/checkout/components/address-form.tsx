"use client";

import { SHIPPING_COUNTRIES, type Country } from "@repo/types";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRY_NAMES } from "../lib/countries";

export type AddressValues = {
  full_name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal_code: string;
  country: Country;
};

export const EMPTY_ADDRESS: AddressValues = {
  full_name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "FI",
};

const countryItems = SHIPPING_COUNTRIES.map((code) => ({
  value: code,
  label: COUNTRY_NAMES[code],
}));

/** A shipping address form; errors are keyed by field name. */
export function AddressForm({
  values,
  errors,
  onChange,
}: {
  values: AddressValues;
  errors: Record<string, string>;
  onChange: (field: keyof AddressValues, value: string) => void;
}) {
  function text(
    name: Exclude<keyof AddressValues, "country">,
    label: string,
    autoComplete: string,
    extra?: { optional?: boolean; type?: string; className?: string },
  ) {
    const id = `address-${name}`;
    return (
      <Field data-invalid={Boolean(errors[name])} className={extra?.className}>
        <FieldLabel htmlFor={id} className="eyebrow !text-foreground">
          {label}
          {extra?.optional && (
            <span className="ml-1 normal-case tracking-normal text-muted-foreground">
              (optional)
            </span>
          )}
        </FieldLabel>
        <Input
          id={id}
          name={name}
          type={extra?.type ?? "text"}
          autoComplete={autoComplete}
          value={values[name]}
          onChange={(e) => onChange(name, e.target.value)}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${id}-error` : undefined}
        />
        <FieldError
          key={errors[name]}
          id={`${id}-error`}
          className="animate-rise"
        >
          {errors[name]}
        </FieldError>
      </Field>
    );
  }

  return (
    <FieldGroup className="grid gap-5 sm:grid-cols-2">
      {text("full_name", "Full name", "shipping name", {
        className: "sm:col-span-2",
      })}
      {text("line1", "Address", "shipping address-line1", {
        className: "sm:col-span-2",
      })}
      {text("line2", "Apartment, suite", "shipping address-line2", {
        optional: true,
        className: "sm:col-span-2",
      })}
      {text("city", "City", "shipping address-level2")}
      {text("region", "State / region", "shipping address-level1", {
        optional: true,
      })}
      {text("postal_code", "Postal code", "shipping postal-code")}
      <Field data-invalid={Boolean(errors.country)}>
        <FieldLabel
          htmlFor="address-country"
          className="eyebrow !text-foreground"
        >
          Country
        </FieldLabel>
        <Select
          value={values.country}
          onValueChange={(value) => value && onChange("country", value)}
          items={countryItems}
        >
          <SelectTrigger
            id="address-country"
            className="h-10 w-full"
            aria-invalid={Boolean(errors.country)}
            aria-describedby={
              errors.country ? "address-country-error" : undefined
            }
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {countryItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="address-country-error">{errors.country}</FieldError>
      </Field>
      {text("phone", "Phone", "shipping tel", {
        type: "tel",
        className: "sm:col-span-2",
      })}
    </FieldGroup>
  );
}
