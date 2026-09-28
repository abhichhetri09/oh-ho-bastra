import { StatusPill } from "@/components/ui/status-pill";
import { customerStatuses } from "@/features/orders/customer-status";
import type { OrderStatus } from "@/features/orders/types";

export function CustomerOrderStatus({ status }: { status: OrderStatus }) {
  const { label, tone } = customerStatuses[status];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}
