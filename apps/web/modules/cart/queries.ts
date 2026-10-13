"use client";

import { useQuery } from "@tanstack/react-query";
import { getCart } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { cartKeys } from "./keys";

/** The signed-in user's cart; idle (no data) when signed out. */
export function useCart() {
  const userId = useAuth((s) => s.user?.id);
  return useQuery({
    queryKey: cartKeys.mine(userId ?? ""),
    queryFn: async ({ signal }) => {
      const { data } = await getCart({ signal, throwOnError: true });
      return data.data;
    },
    enabled: Boolean(userId),
    // Prices and stock move; refresh on focus after 30 s.
    staleTime: 30_000,
  });
}
