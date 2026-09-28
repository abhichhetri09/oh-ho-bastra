import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CartLine } from "@/features/cart/cart-context";
import { getJson, postJson } from "@/lib/http";
import type { CheckoutDetails, CheckoutOptions } from "./types";

export function useCheckoutOptions() {
  return useQuery({
    queryKey: ["checkout-options"],
    queryFn: () => getJson<CheckoutOptions>("/checkout/options"),
    staleTime: Infinity,
  });
}

/** Resolves stored ids to display names; falls back to the id. */
export function useCheckoutLabels() {
  const { data } = useCheckoutOptions();
  return {
    shipping: (id: string) => data?.names[id] ?? id,
    payment: (id: string) => data?.names[id] ?? id,
    paymentMethod: (id: string) =>
      data?.paymentMethods.find((method) => method.id === id),
  };
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckoutDetails & { items: CartLine[] }) =>
      postJson<{ orderId: string; paymentUrl: string }>("/orders", input),
    // Stock changed.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}
