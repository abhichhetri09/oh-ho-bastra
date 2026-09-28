import { useQuery } from "@tanstack/react-query";

import { getJson, retryUnlessClientError as retry } from "@/lib/http";
import type { Order } from "./types";

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["orders", id],
    queryFn: () => getJson<Order>(`/orders/${id}`),
    enabled: Boolean(id),
    retry,
  });
}

