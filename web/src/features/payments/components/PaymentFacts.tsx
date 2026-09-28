import { SummaryList } from "@/components/ui/summary-list";
import type { Payment } from "@/features/payments/types";
import { formatPrice } from "@/lib/format";

export function PaymentFacts({ payment }: { payment: Payment }) {
  return (
    <SummaryList
      className="mt-8"
      rows={[
        { label: "Merchant", value: "Oh Ho Bastra" },
        { label: "Order", value: `#${payment.orderNumber}` },
        { label: "Reference", value: payment.reference },
        { label: "Amount", value: formatPrice(payment.amountCents, payment.currency), total: true },
      ]}
    />
  );
}
