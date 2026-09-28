// Finnish general VAT rate (since 1 Sep 2024). Prices are stored VAT-inclusive.
export const VAT_RATE_BASIS_POINTS = 2550;

export function vatIncluded(grossCents: number) {
  return Math.round(
    (grossCents * VAT_RATE_BASIS_POINTS) / (10_000 + VAT_RATE_BASIS_POINTS),
  );
}

export const shippingOptions = [
  {
    id: "posti-parcel-locker",
    name: "Posti — Parcel locker",
    description: "Pick up from a Posti parcel locker or outlet. 1–3 working days.",
    priceCents: 490,
  },
  {
    id: "matkahuolto-near-you",
    name: "Matkahuolto — Near you",
    description: "Pick up from a nearby Matkahuolto point. 1–3 working days.",
    priceCents: 450,
  },
  {
    id: "posti-home",
    name: "Posti — Home delivery",
    description: "Delivered to your door, evening slot. 2–4 working days.",
    priceCents: 990,
  },
] as const;

export type ShippingOptionId = (typeof shippingOptions)[number]["id"];

// Mirrors what a Paytrail checkout offers. Everything is mocked for now.
export const paymentMethods = [
  { id: "op", name: "OP", group: "bank" },
  { id: "nordea", name: "Nordea", group: "bank" },
  { id: "danske", name: "Danske Bank", group: "bank" },
  { id: "spankki", name: "S-Pankki", group: "bank" },
  { id: "aktia", name: "Aktia", group: "bank" },
  { id: "saastopankki", name: "Säästöpankki", group: "bank" },
  { id: "pop", name: "POP Pankki", group: "bank" },
  { id: "omasp", name: "OmaSP", group: "bank" },
  { id: "handelsbanken", name: "Handelsbanken", group: "bank" },
  { id: "alandsbanken", name: "Ålandsbanken", group: "bank" },
  { id: "mobilepay", name: "MobilePay", group: "mobile" },
  { id: "applepay", name: "Apple Pay", group: "mobile" },
  { id: "card", name: "Visa / Mastercard", group: "card" },
  { id: "klarna", name: "Klarna — Pay later", group: "credit" },
  { id: "walley", name: "Walley — Invoice", group: "credit" },
] as const;

export type PaymentMethodId = (typeof paymentMethods)[number]["id"];

export const shippingOptionIds = shippingOptions.map((option) => option.id) as [
  ShippingOptionId,
  ...ShippingOptionId[],
];

export const paymentMethodIds = paymentMethods.map((method) => method.id) as [
  PaymentMethodId,
  ...PaymentMethodId[],
];
