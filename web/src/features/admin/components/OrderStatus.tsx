import { StatusPill } from "@/components/ui/status-pill";
import { adminOrderLabels, orderStatusTone } from "@/features/admin/status";
import type { OrderStatus as Status } from "@/features/orders/types";

export function OrderStatus({ status }: { status: Status }) {
  return <StatusPill tone={orderStatusTone[status]}>{adminOrderLabels[status]}</StatusPill>;
}
