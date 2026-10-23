import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PaymentStatus } from "@/features/orders/types";
import { getJson, postJson, retryUnlessClientError as retry } from "@/lib/http";
import type { MockOutcome, Payment } from "./types";

export function usePayment(id: string | undefined) {
  return useQuery({
    queryKey: ["payments", id],
    queryFn: () => getJson<Payment>(`/payments/${id}`),
    enabled: Boolean(id),
    retry,
  });
}

export function useCompleteMockPayment(paymentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (outcome: MockOutcome) =>
      postJson<{ orderId: string; status: PaymentStatus }>(
        `/payments/${paymentId}/mock-complete`,
        { outcome },
      ),
    onSuccess: () =>
      Promise.all(
        ["payments", "orders", "products"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}
