import { useState } from "react";

import { Close, Truck } from "@/components/icons";
import { FormField } from "@/components/ui/form-field";
import { useSetOrderStatus } from "@/features/admin/api";
import { ConfirmAction } from "@/components/ui/confirm-action";
import type { AdminOrder } from "@/features/admin/types";

/** Ship and cancel, offered only for the transitions the API allows. */
export function OrderActionsBar({ order }: { order: AdminOrder }) {
  const setStatus = useSetOrderStatus(order.id);
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("");
  const allowed = new Set(order.allowedTransitions);
  const error = setStatus.error?.message ?? null;

  return (
    <>
      {allowed.has("fulfilled") ? (
        <ConfirmAction
          triggerVariant="default"
          trigger={
            <>
              <Truck />
              Mark as shipped
            </>
          }
          title={`Ship order #${order.number}`}
          description="Add the carrier’s tracking number if you have one."
          confirmLabel="Mark as shipped"
          pending={setStatus.isPending}
          error={error}
          onConfirm={() => setStatus.mutateAsync({ status: "fulfilled", trackingNumber: tracking.trim() || undefined })}
        >
          <FormField
            id="tracking"
            label="Tracking number (optional)"
            placeholder="JJFI60123456789"
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
          />
        </ConfirmAction>
      ) : null}
      {allowed.has("cancelled") ? (
        <ConfirmAction
          tone="destructive"
          trigger={
            <>
              <Close />
              Cancel order
            </>
          }
          title={`Cancel order #${order.number}?`}
          description={
            order.status === "paid"
              ? "Its tees go back into stock. Refund the payment in the Paytrail dashboard — this does not move money."
              : "Its tees go back into stock and the customer can no longer pay for it."
          }
          confirmLabel="Cancel order"
          pending={setStatus.isPending}
          error={error}
          onConfirm={() => setStatus.mutateAsync({ status: "cancelled", reason: reason.trim() || undefined })}
        >
          <FormField
            id="reason"
            label="Reason (optional, internal)"
            placeholder="Customer asked to cancel"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </ConfirmAction>
      ) : null}
    </>
  );
}
