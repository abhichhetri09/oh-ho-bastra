import { createContext, useContext } from "react";

export type CartLine = {
  slug: string;
  size: string;
  quantity: number;
};

type CartContextValue = {
  lines: CartLine[];
  itemCount: number;
  add: (slug: string, quantity: number, size: string) => void;
  setQuantity: (slug: string, size: string, quantity: number) => void;
  remove: (slug: string, size: string) => void;
  clear: () => void;
};

export const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) {
    throw new Error("useCart must be used within CartProvider");
  }
  return cart;
}
