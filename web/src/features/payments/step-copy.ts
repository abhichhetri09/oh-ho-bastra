import type { PaymentMethodGroup } from "@/features/checkout/types";

/** What the real provider would ask the buyer to do next, per method group. */
export const stepCopy: Record<PaymentMethodGroup, (name: string) => string> = {
  bank: (name) => `You would now sign in to ${name} with your online banking codes and confirm.`,
  mobile: (name) => `You would now confirm the payment in ${name} on your phone.`,
  card: () => "You would now enter card details and pass the 3-D Secure check.",
  credit: (name) => `You would now identify yourself to ${name} and accept the terms.`,
};
