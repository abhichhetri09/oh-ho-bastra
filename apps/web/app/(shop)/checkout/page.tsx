import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/session";
import { getServerCart } from "@/modules/cart/api";
import { CheckoutView } from "@/modules/checkout/components/checkout-view";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

export default async function CheckoutPage() {
  // The shop layout seeded the cart when it could (same request).
  const user = await getSessionUser();
  const cart = user ? await getServerCart() : null;
  return <CheckoutView seeded={cart !== null} />;
}
