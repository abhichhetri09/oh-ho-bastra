export type ShippingOption = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
};

export type PaymentMethodGroup = "bank" | "mobile" | "card" | "credit";

export type PaymentMethod = {
  id: string;
  name: string;
  group: PaymentMethodGroup;
};

export type CheckoutOptions = {
  vatRate: number;
  shippingOptions: ShippingOption[];
  paymentMethods: PaymentMethod[];
  /** Orders at or above this subtotal ship free; null when off. */
  freeShippingThresholdCents: number | null;
  /** Display names for every shipping option and payment method id. */
  names: Record<string, string>;
};

export function shippingCost(option: ShippingOption, subtotalCents: number, freeFrom: number | null) {
  return freeFrom !== null && subtotalCents >= freeFrom ? 0 : option.priceCents;
}

export type CheckoutDetails = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  street: string;
  postalCode: string;
  city: string;
  shippingMethod: string;
  paymentMethod: string;
};

export const paymentGroupLabels: Record<PaymentMethodGroup, string> = {
  bank: "Online bank",
  mobile: "Mobile",
  card: "Card",
  credit: "Pay later",
};
