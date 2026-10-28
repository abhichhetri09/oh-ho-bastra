"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { OrderDetail, OrderLookupBody } from "@repo/types";
import {
  getCheckoutSession,
  getOrder,
  listAddresses,
  listOrders,
  lookupOrder,
} from "@/lib/api/client";
import { accountOf } from "@/lib/auth/redirect";
import { useAuth } from "@/providers/auth-provider";
import { addressKeys, orderKeys } from "./keys";

function useUserId() {
  return useAuth((s) => s.user?.id ?? "");
}

/** The account's saved addresses; idle for a guest, which has none. */
export function useAddresses() {
  const userId = useAuth((s) => accountOf(s.user)?.id ?? "");
  return useQuery({
    queryKey: addressKeys.mine(userId),
    queryFn: async ({ signal }) => {
      const { data } = await listAddresses({ signal, throwOnError: true });
      return data.data;
    },
    enabled: Boolean(userId),
  });
}

/**
 * An order found by its number and email, for shoppers without an account
 * (read-only: no reviews). Throws the API error, a 404 for no match.
 */
export async function lookupOrderByEmail(
  body: OrderLookupBody,
): Promise<OrderDetail> {
  const { data } = await lookupOrder({ body, throwOnError: true });
  return data.data;
}

/** Order history, 10 at a time as the list scrolls. */
export function useOrders() {
  const userId = useUserId();
  return useInfiniteQuery({
    queryKey: orderKeys.list(userId),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listOrders({
        query: { page: pageParam },
        signal,
        throwOnError: true,
      });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: ({ meta }) =>
      meta.page < meta.total_pages ? meta.page + 1 : undefined,
    enabled: Boolean(userId),
  });
}

export function useOrder(number: number) {
  const userId = useUserId();
  return useQuery({
    queryKey: orderKeys.detail(userId, number),
    queryFn: async ({ signal }) => {
      const { data } = await getOrder({
        path: { number },
        signal,
        throwOnError: true,
      });
      return data.data;
    },
    enabled: Boolean(userId),
  });
}

/** How long the success page keeps asking before it says "still working". */
export const CONFIRM_TIMEOUT = 45_000;
const POLL_EVERY = 1_500;

/**
 * The order behind a Stripe session, polled while payment is confirmed
 * (each poll also asks Stripe, so it settles without the webhook).
 */
export function useCheckoutSession(sessionId: string, startedAt: number) {
  const userId = useUserId();
  return useQuery({
    queryKey: orderKeys.session(userId, sessionId),
    queryFn: async ({ signal }): Promise<OrderDetail> => {
      const { data } = await getCheckoutSession({
        path: { sessionID: sessionId },
        signal,
        throwOnError: true,
      });
      return data.data;
    },
    enabled: Boolean(userId && sessionId),
    refetchInterval: (query) =>
      query.state.data?.status === "pending" &&
      Date.now() - startedAt < CONFIRM_TIMEOUT
        ? POLL_EVERY
        : false,
    retry: 2,
  });
}
