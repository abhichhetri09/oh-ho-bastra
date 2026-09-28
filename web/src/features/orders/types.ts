import type { Swatch } from "@/features/catalog/types";

export type OrderStatus = "pending_payment" | "paid" | "cancelled" | "fulfilled";
export type PaymentStatus = "pending" | "paid" | "cancelled" | "failed";

export type OrderLine = {
  productSlug: string;
  productName: string;
  size: string;
  sku: string;
  unitPriceCents: number;
  quantity: number;
  swatch: Swatch | null;
  imageUrl: string | null;
};

export type OrderAddress = {
  firstName: string;
  lastName: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  shippingMethod: string;
};

export type OrderTotals = {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  vatCents: number;
  currency: string;
};

export type Order = OrderAddress &
  OrderTotals & {
    id: string;
    number: number;
    status: OrderStatus;
    email: string;
    phone: string;
    createdAt: string;
    paidAt: string | null;
    shippedAt: string | null;
    trackingNumber: string | null;
    items: OrderLine[];
    payment: {
      id: string;
      method: string;
      status: PaymentStatus;
      reference: string;
    } | null;
  };

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  cancelled: "Cancelled",
  fulfilled: "Shipped",
};
