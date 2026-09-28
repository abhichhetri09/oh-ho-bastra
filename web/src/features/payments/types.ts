import type { PaymentStatus } from "@/features/orders/types";

export type Payment = {
  id: string;
  orderId: string;
  orderNumber: number;
  method: string;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  reference: string;
};

export type MockOutcome = "paid" | "cancelled" | "failed";
