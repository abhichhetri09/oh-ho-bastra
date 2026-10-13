"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { StatsRange } from "@repo/types";
import {
  adminGetCounts,
  adminSearch,
  adminGetCustomer,
  adminGetOrder,
  adminGetProduct,
  adminGetStats,
  adminListCustomers,
  adminListEmails,
  adminListInventory,
  adminListOrders,
  adminListProducts,
  adminListReviews,
  adminListVariants,
  listCategories,
} from "@/lib/api/client";
import { adminKeys } from "./keys";
import { adminProductsQuery, type AdminProductFilters } from "./lib/filters";
import {
  adminCustomersQuery,
  adminEmailsQuery,
  adminInventoryQuery,
  adminOrdersQuery,
  adminReviewsQuery,
  type AdminCustomerFilters,
  type AdminEmailFilters,
  type AdminInventoryFilters,
  type AdminOrderFilters,
  type AdminReviewFilters,
} from "./lib/order-filters";

/** The dashboard for a range; the last range stays up while the next loads. */
export function useAdminStats(range: StatsRange) {
  return useQuery({
    queryKey: adminKeys.stats(range),
    queryFn: async ({ signal }) => {
      const { data } = await adminGetStats({
        query: { range },
        signal,
        throwOnError: true,
      });
      return data.data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** One page of the products table; the last page stays up while the next loads. */
export function useAdminProducts(filters: AdminProductFilters) {
  return useQuery({
    queryKey: adminKeys.productList(filters),
    queryFn: async ({ signal }) => {
      const { data } = await adminListProducts({
        query: adminProductsQuery(filters),
        signal,
        throwOnError: true,
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useAdminProduct(id: string) {
  return useQuery({
    queryKey: adminKeys.product(id),
    queryFn: async ({ signal }) => {
      const { data } = await adminGetProduct({
        path: { productID: id },
        signal,
        throwOnError: true,
      });
      return data.data;
    },
  });
}

export function useAdminVariants(productId: string) {
  return useQuery({
    queryKey: adminKeys.variants(productId),
    queryFn: async ({ signal }) => {
      const { data } = await adminListVariants({
        path: { productID: productId },
        signal,
        throwOnError: true,
      });
      return data.data;
    },
  });
}

/** The whole category tree (it is small: one request, no pages). */
export function useCategoryTree() {
  return useQuery({
    queryKey: adminKeys.categories(),
    queryFn: async ({ signal }) => {
      const { data } = await listCategories({ signal, throwOnError: true });
      return data.data;
    },
    staleTime: 60_000,
  });
}

/** One page of the orders table; the last page stays up while the next loads. */
export function useAdminOrders(filters: AdminOrderFilters) {
  return useQuery({
    queryKey: adminKeys.orderList(filters),
    queryFn: async ({ signal }) => {
      const { data } = await adminListOrders({
        query: adminOrdersQuery(filters),
        signal,
        throwOnError: true,
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrder(number: number) {
  return useQuery({
    queryKey: adminKeys.order(number),
    queryFn: async ({ signal }) => {
      const { data } = await adminGetOrder({
        path: { number },
        signal,
        throwOnError: true,
      });
      return data.data;
    },
  });
}

export function useAdminReviews(filters: AdminReviewFilters) {
  return useQuery({
    queryKey: adminKeys.reviewList(filters),
    queryFn: async ({ signal }) => {
      const { data } = await adminListReviews({
        query: adminReviewsQuery(filters),
        signal,
        throwOnError: true,
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

/** One page of the customers table; the last page stays up while the next loads. */
export function useAdminCustomers(filters: AdminCustomerFilters) {
  return useQuery({
    queryKey: adminKeys.customerList(filters),
    queryFn: async ({ signal }) => {
      const { data } = await adminListCustomers({
        query: adminCustomersQuery(filters),
        signal,
        throwOnError: true,
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useAdminCustomer(id: string) {
  return useQuery({
    queryKey: adminKeys.customer(id),
    queryFn: async ({ signal }) => {
      const { data } = await adminGetCustomer({
        path: { userID: id },
        signal,
        throwOnError: true,
      });
      return data.data;
    },
  });
}

/**
 * What's waiting on the admin (nav badges, order tabs): refetched every
 * minute and when the window regains focus.
 */
export function useAdminCounts() {
  return useQuery({
    queryKey: adminKeys.counts(),
    queryFn: async ({ signal }) => {
      const { data } = await adminGetCounts({ signal, throwOnError: true });
      return data.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** One page of the inventory; the last page stays up while the next loads. */
export function useAdminInventory(filters: AdminInventoryFilters) {
  return useQuery({
    queryKey: adminKeys.inventoryList(filters),
    queryFn: async ({ signal }) => {
      const { data } = await adminListInventory({
        query: adminInventoryQuery(filters),
        signal,
        throwOnError: true,
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

/** One page of the email outbox; the last page stays up while the next loads. */
export function useAdminEmails(filters: AdminEmailFilters) {
  return useQuery({
    queryKey: adminKeys.emailList(filters),
    queryFn: async ({ signal }) => {
      const { data } = await adminListEmails({
        query: adminEmailsQuery(filters),
        signal,
        throwOnError: true,
      });
      return data;
    },
    placeholderData: keepPreviousData,
    // While any shown email waits to be sent, watch it go out.
    refetchInterval: (query) =>
      query.state.data?.data.rows.some((r) => r.status === "pending")
        ? 5_000
        : false,
  });
}

/** The command palette's matches; idle until there's something to search. */
export function useAdminSearch(q: string) {
  return useQuery({
    queryKey: adminKeys.search(q),
    queryFn: async ({ signal }) => {
      const { data } = await adminSearch({
        query: { q },
        signal,
        throwOnError: true,
      });
      return data.data;
    },
    enabled: q.length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
