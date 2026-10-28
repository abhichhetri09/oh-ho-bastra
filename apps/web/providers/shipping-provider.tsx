"use client";

import { createContext, useContext } from "react";
import type { ShippingRule } from "@repo/types";

const ShippingContext = createContext<ShippingRule | null>(null);

/**
 * The store's shipping rule, read on the server from the cached settings
 * (storeShipping), for client code that prices the bag before the API
 * answers and draws the free-shipping bar. A save in the admin refreshes
 * the layout, and with it the rule.
 */
export function ShippingProvider({
  rule,
  children,
}: {
  rule: ShippingRule;
  children: React.ReactNode;
}) {
  return (
    <ShippingContext.Provider value={rule}>{children}</ShippingContext.Provider>
  );
}

export function useShippingRule(): ShippingRule {
  const rule = useContext(ShippingContext);
  if (!rule)
    throw new Error("useShippingRule must be used inside <ShippingProvider>");
  return rule;
}
