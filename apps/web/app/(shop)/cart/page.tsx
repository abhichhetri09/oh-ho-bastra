import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/session";
import { getServerCart } from "@/modules/cart/api";
import { CartView } from "@/modules/cart/components/cart-view";

export const metadata: Metadata = {
  title: "Your bag",
  robots: { index: false },
};

export default async function CartPage() {
  // The shop layout seeded the cart when it could read it (same request,
  // deduplicated); the view needs to know whether it did.
  const user = await getSessionUser();
  const cart = user ? await getServerCart() : null;
  return <CartView seeded={cart !== null} />;
}
