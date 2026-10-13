import type { Metadata } from "next";
import { WishlistView } from "@/modules/wishlist/components/wishlist-view";

export const metadata: Metadata = { title: "Wishlist" };

export default function WishlistPage() {
  return <WishlistView />;
}
