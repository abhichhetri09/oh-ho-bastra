import type { Order } from "./types";

/** Customer-facing title and message for an order's current status. */
export function orderHeading(order: Pick<Order, "status" | "number">) {
  switch (order.status) {
    case "paid":
    case "fulfilled":
      return {
        title: "Thank you",
        description: `Order #${order.number} is paid. Keep this page’s link — it’s your receipt.`,
      };
    case "cancelled":
      return {
        title: "Order cancelled",
        description:
          "The payment did not go through and nothing was charged. Your bag is as you left it.",
      };
    default:
      return {
        title: "Awaiting payment",
        description: `Order #${order.number} is saved, but not paid yet.`,
      };
  }
}
