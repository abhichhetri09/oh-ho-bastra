import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getProduct } from "@/data/products";

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

const CartContext = createContext<CartContextValue | null>(null);

function sameLine(line: CartLine, slug: string, size: string) {
  return line.slug === slug && line.size === size;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = useCallback((slug: string, quantity: number, size: string) => {
    const product = getProduct(slug);
    if (!product || quantity < 1 || !product.sizes.includes(size)) {
      return;
    }
    setLines((current) => {
      const existing = current.find((line) => sameLine(line, slug, size));
      if (existing) {
        return current.map((line) =>
          sameLine(line, slug, size)
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [...current, { slug, size, quantity }];
    });
  }, []);

  const setQuantity = useCallback(
    (slug: string, size: string, quantity: number) => {
      setLines((current) => {
        if (quantity <= 0) {
          return current.filter((line) => !sameLine(line, slug, size));
        }
        return current.map((line) =>
          sameLine(line, slug, size) ? { ...line, quantity } : line,
        );
      });
    },
    [],
  );

  const remove = useCallback((slug: string, size: string) => {
    setLines((current) =>
      current.filter((line) => !sameLine(line, slug, size)),
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  );

  const value = useMemo(
    () => ({ lines, itemCount, add, setQuantity, remove, clear }),
    [lines, itemCount, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) {
    throw new Error("useCart must be used within CartProvider");
  }
  return cart;
}
