"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ReviewBody } from "@repo/types";
import {
  deleteReview,
  getMyReview,
  listReviews,
  writeReview,
} from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { orderKeys } from "@/modules/checkout/keys";
import { reviewKeys } from "./keys";

/** A product's published reviews, 10 at a time, with the summary. */
export function useReviews(slug: string) {
  return useInfiniteQuery({
    queryKey: reviewKeys.list(slug),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listReviews({
        path: { productSlug: slug },
        query: { page: pageParam },
        signal,
        throwOnError: true,
      });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: ({ meta }) =>
      meta.page < meta.total_pages ? meta.page + 1 : undefined,
  });
}

/** Whether I may review the product, and my review; idle when signed out. */
export function useMyReview(slug: string) {
  const userId = useAuth((s) => s.user?.id ?? "");
  return useQuery({
    queryKey: reviewKeys.mine(userId, slug),
    queryFn: async ({ signal }) => {
      const { data } = await getMyReview({
        path: { productSlug: slug },
        signal,
        throwOnError: true,
      });
      return data.data;
    },
    enabled: Boolean(userId),
  });
}

/**
 * Write, edit and delete my review; both lists refresh after, and my orders,
 * which say which of their products I've reviewed.
 */
export function useReviewMutations(slug: string) {
  const queryClient = useQueryClient();
  const userId = useAuth((s) => s.user?.id ?? "");

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewKeys.list(slug) }),
      queryClient.invalidateQueries({
        queryKey: reviewKeys.mine(userId, slug),
      }),
      queryClient.invalidateQueries({ queryKey: [...orderKeys.all, userId] }),
    ]);
  }

  const write = useMutation({
    mutationFn: async (body: ReviewBody) => {
      const { data } = await writeReview({
        path: { productSlug: slug },
        body,
        throwOnError: true,
      });
      return data.data;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async () => {
      await deleteReview({ path: { productSlug: slug }, throwOnError: true });
    },
    onSuccess: refresh,
  });

  return { write, remove };
}
