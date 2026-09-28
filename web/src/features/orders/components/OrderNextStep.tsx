import { Link } from "react-router-dom";

import { ArrowRight, Bag } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { Order } from "@/features/orders/types";

/** The one thing the buyer can do next with this order, if anything. */
export function OrderNextStep({ order }: { order: Order }) {
  if (order.status === "pending_payment" && order.payment) {
    return (
      <Button asChild>
        <Link to={`/pay/${order.payment.id}`}>
          <ArrowRight />
          Continue to payment
        </Link>
      </Button>
    );
  }
  if (order.status === "cancelled") {
    return (
      <Button variant="outline" asChild>
        <Link to="/cart">
          <Bag />
          Back to bag
        </Link>
      </Button>
    );
  }
  return null;
}
