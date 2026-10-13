"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addToWishlist,
  listWishlist,
  listWishlistIds,
  removeFromWishlist,
} from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { loginPath } from "@/lib/auth/redirect";
import { rememberIntent } from "@/modules/auth/lib/pending-intent";
import { useHydrated } from "@/hooks/use-hydrated";
import { useAuth } from "@/providers/auth-provider";
import { wishlistKeys } from "./keys";
import { useWishlistDrawer } from "./store";

const mutationKey = [...wishlistKeys.all, "write"] as const;

/** Every saved product id, as a set; empty when signed out. */
export function useWishlistIds() {
  const userId = useAuth((s) => s.user?.id ?? "");
  const query = useQuery({
    queryKey: wishlistKeys.ids(userId),
    queryFn: async ({ signal }) => {
      const { data } = await listWishlistIds({ signal, throwOnError: true });
      return data.data;
    },
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });
  const ids = useMemo(() => new Set(query.data ?? []), [query.data]);
  return { ids, ready: query.isSuccess };
}

// Set when a toggle fails while another is still in flight: its snapshot
// would undo the other's change, so the last one to settle refetches.
let resync = false;

/**
 * Saves or unsaves a product at once (the heart fills before the API
 * answers) and rolls back with a toast if it refuses. Signed-out shoppers
 * go to sign in first.
 */
export function useToggleWishlist() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const userId = useAuth((s) => s.user?.id ?? "");
  const key = wishlistKeys.ids(userId);

  const mutation = useMutation({
    mutationKey,
    mutationFn: async ({
      id,
      save,
    }: {
      id: string;
      save: boolean;
      name: string;
    }) => {
      const options = { path: { productID: id }, throwOnError: true as const };
      await (save ? addToWishlist(options) : removeFromWishlist(options));
    },
    onMutate: async ({ id, save }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key);
      queryClient.setQueryData<string[]>(key, (ids = []) =>
        save
          ? [id, ...ids.filter((x) => x !== id)]
          : ids.filter((x) => x !== id),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      // This mutation still counts as in flight while its callbacks run.
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        queryClient.setQueryData(key, context?.previous);
      } else {
        resync = true;
      }
      toast.error(
        getApiError(error)?.message ?? "Couldn't update your wishlist.",
      );
    },
    onSuccess: (_data, { save, name }) => {
      if (save) {
        toast(`Saved ${name}`, {
          action: {
            label: "View wishlist",
            onClick: () => useWishlistDrawer.getState().setOpen(true),
          },
        });
      }
    },
    onSettled: () => {
      if (resync && queryClient.isMutating({ mutationKey }) <= 1) {
        resync = false;
        void queryClient.invalidateQueries({ queryKey: key });
      }
      // The saved-products page refetches when next shown.
      void queryClient.invalidateQueries({
        queryKey: wishlistKeys.list(userId),
        refetchType: "none",
      });
    },
  });

  return (id: string, save: boolean, name: string) => {
    if (!userId) {
      // Saved for them once they're back from signing in.
      if (save) {
        rememberIntent({
          kind: "save",
          path: pathname,
          productId: id,
          name,
          at: Date.now(),
        });
      }
      router.push(loginPath(pathname + window.location.search));
      return;
    }
    mutation.mutate({ id, save, name });
  };
}

/** Saved products still on sale, 24 at a time. */
export function useWishlistProducts() {
  const userId = useAuth((s) => s.user?.id ?? "");
  return useInfiniteQuery({
    queryKey: wishlistKeys.list(userId),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listWishlist({
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

/**
 * The saved products to show: the loaded pages, minus any the shopper has
 * just unsaved (the ids update at once, the list on its next fetch).
 */
export function useSavedProducts() {
  const hydrated = useHydrated();
  const query = useWishlistProducts();
  const { ids, ready } = useWishlistIds();
  const products = (query.data?.pages.flatMap((p) => p.data) ?? []).filter(
    (p) => !hydrated || !ready || ids.has(p.id),
  );
  return { query, products };
}

/** How many products the shopper has saved (0 until hydrated, as on the server). */
export function useSavedCount() {
  const hydrated = useHydrated();
  const { ids } = useWishlistIds();
  return hydrated ? ids.size : 0;
}
