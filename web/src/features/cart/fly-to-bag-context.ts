import { createContext, useContext } from "react";

import type { Swatch } from "@/features/catalog/types";

export type FlyVisual = { image?: string | null; swatch?: Swatch | null };

type FlyToBagValue = {
  fly: (from: DOMRect, visual: FlyVisual) => void;
  bump: number;
};

export const FlyToBagContext = createContext<FlyToBagValue | null>(null);

export function useFlyToBag() {
  const value = useContext(FlyToBagContext);
  if (!value) {
    throw new Error("useFlyToBag must be used within FlyToBagProvider");
  }
  return value;
}
