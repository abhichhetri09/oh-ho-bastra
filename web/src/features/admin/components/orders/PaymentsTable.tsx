import { DataTable } from "@/components/ui/data-table";
import { StatusPill, type Tone } from "@/components/ui/status-pill";
import { Panel } from "@/components/app-shell/Panel";
import type { AdminOrder } from "@/features/admin/types";
import { useCheckoutLabels } from "@/features/checkout/api";
import type { PaymentStatus } from "@/features/orders/types";
import { formatDateTime, formatPrice } from "@/lib/format";

const tone: Record<PaymentStatus, Tone> = { pending: "warning", paid: "success", cancelled: "neutral", failed: "danger" };

export function PaymentsTable({ order }: { order: AdminOrder }) {
  const labels = useCheckoutLabels();
  return (
    <Panel
      title="Payments"
      description={order.payments[0] ? `Provider: ${order.payments[0].provider}` : undefined}
      flush
    >
      <DataTable
        dense
        empty="No payment recorded for this order."
        rows={order.payments}
        getKey={(p) => p.id}
        columns={[
          { key: "method", header: "Method", cell: (p) => labels.payment(p.method) },
          { key: "ref", header: "Reference", className: "tabular-nums text-muted-foreground", cell: (p) => p.reference },
          { key: "when", header: "Updated", hideBelow: "md", className: "text-muted-foreground", cell: (p) => formatDateTime(p.completedAt ?? p.createdAt) },
          { key: "status", header: "Status", cell: (p) => <StatusPill tone={tone[p.status]}>{p.status}</StatusPill> },
          { key: "amount", header: "Amount", align: "right", className: "tabular-nums", cell: (p) => formatPrice(p.amountCents, order.currency) },
        ]}
      />
    </Panel>
  );
}
