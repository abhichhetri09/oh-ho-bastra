"use client";

import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiError } from "@/lib/api/errors";
import { revalidateCatalog } from "../actions";
import { adminKeys } from "../keys";

/**
 * A catalog write from the admin: on success it refetches the admin data it
 * touched (every admin query unless `invalidate` narrows it) and expires the
 * storefront's cached catalog, so shoppers see the change on their next
 * page. Failures toast the API's message; a form that shows field errors
 * sets `quietOnFieldErrors` and renders validation failures itself.
 */
export function useAdminMutation<TVars, TData>({
  mutationFn,
  success,
  failure = "Something went wrong. Try again.",
  invalidate = [adminKeys.all],
  quietOnFieldErrors = false,
  onSuccess,
}: {
  mutationFn: (vars: TVars) => Promise<TData>;
  success?: string | ((data: TData, vars: TVars) => string);
  failure?: string;
  invalidate?: QueryKey[];
  quietOnFieldErrors?: boolean;
  onSuccess?: (data: TData, vars: TVars) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (data, vars) => {
      onSuccess?.(data, vars);
      if (success) {
        toast.success(
          typeof success === "string" ? success : success(data, vars),
        );
      }
      // The storefront's cache: best effort, the admin data matters here.
      void revalidateCatalog().catch(() => undefined);
      await Promise.all(
        invalidate.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onError: (error) => {
      const apiError = getApiError(error);
      if (quietOnFieldErrors && apiError?.errors?.length) return;
      toast.error(apiError?.message ?? failure);
    },
  });
}
