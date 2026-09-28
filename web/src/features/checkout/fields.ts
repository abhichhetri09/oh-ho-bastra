import type { InputHTMLAttributes } from "react";

import type { CheckoutDetails } from "./types";

export type FieldConfig = {
  field: keyof CheckoutDetails;
  label: string;
  /** Spans both columns of the two-column field grid. */
  wide?: boolean;
} & Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "autoComplete" | "placeholder" | "inputMode" | "pattern" | "maxLength" | "title"
>;

export const contactFields: FieldConfig[] = [
  { field: "email", label: "Email", type: "email", autoComplete: "email" },
  { field: "phone", label: "Phone", type: "tel", autoComplete: "tel", placeholder: "+358 40 123 4567" },
];

export const addressFields: FieldConfig[] = [
  { field: "firstName", label: "First name", autoComplete: "given-name" },
  { field: "lastName", label: "Last name", autoComplete: "family-name" },
  { field: "street", label: "Street address", autoComplete: "street-address", wide: true },
  {
    field: "postalCode",
    label: "Postal code",
    autoComplete: "postal-code",
    inputMode: "numeric",
    pattern: "\\d{5}",
    maxLength: 5,
    title: "Five digits, for example 00100",
    placeholder: "00100",
  },
  { field: "city", label: "City", autoComplete: "address-level2", placeholder: "Helsinki" },
];
