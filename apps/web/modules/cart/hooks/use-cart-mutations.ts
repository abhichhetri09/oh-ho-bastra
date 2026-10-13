"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Cart, CartLine } from "@repo/types";
import { addCartItem, removeCartItem, updateCartItem } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { cartKeys } from "../keys";
import {
  addLine,
  type LinePreview,
  optionSummary,
  removeLine,
  setLineQuantity,
} from "../lib/cart-math";
import { useBagDrawer } from "../store";

const mutationKey = [...cartKeys.all, "write"] as const;

/** The API's message for a refused cart write, else a generic one. */
export function cartErrorMessage(error: unknown): string {
  return getApiError(error)?.message ?? "Couldn't update your bag. Try again.";
}

/** An add to the bag. */
export type AddToBagVars = {
  variant_id: string;
  quantity: number;
  /** Shows a new line before the API answers (an existing one just grows). */
  preview?: LinePreview;
  /** Confirms with an "Added … · View bag" toast once the API agrees. */
  announce?: boolean;
};

/**
 * Cart writes. Each answers with the whole cart, which replaces the cached
 * one, but only when no other cart write is still in flight: answers can
 * arrive out of order, and the last write's answer is the truth. Every
 * write shows at once and rolls back if the API refuses. Their callbacks
 * live here, not on mutate(), so they still run when the component that
 * started the write has gone (a removed line's Undo).
 */
export function useCartMutations() {
  const queryClient = useQueryClient();
  const userId = useAuth((s) => s.user?.id ?? "");
  const key = cartKeys.mine(userId);

  function settle(cart: Cart) {
    // This mutation still counts as in flight while its callbacks run.
    if (queryClient.isMutating({ mutationKey }) <= 1) {
      queryClient.setQueryData(key, cart);
    }
  }

  async function optimistic(update: (cart: Cart) => Cart) {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<Cart>(key);
    if (previous) queryClient.setQueryData(key, update(previous));
    return { previous };
  }

  function rollback(
    error: unknown,
    context?: { previous?: Cart },
    toastId?: string,
  ) {
    if (context?.previous) queryClient.setQueryData(key, context.previous);
    // The snapshot may hold another write's optimistic state, and earlier
    // answers were skipped while this one was in flight: resync.
    void queryClient.invalidateQueries({ queryKey: key });
    // Replacing an "Added" toast by id keeps its options unless cleared.
    toast.error(cartErrorMessage(error), {
      id: toastId,
      description: undefined,
      action: undefined,
    });
  }

  const add = useMutation({
    mutationKey,
    mutationFn: async ({ variant_id, quantity }: AddToBagVars) => {
      const { data } = await addCartItem({
        body: { variant_id, quantity },
        throwOnError: true,
      });
      return data.data;
    },
    onMutate: ({ variant_id, quantity, preview }) =>
      optimistic((cart) => addLine(cart, variant_id, quantity, preview)),
    onError: (error, vars, context) =>
      rollback(error, context, `add-${vars.variant_id}`),
    onSuccess: (cart, vars) => {
      settle(cart);
      if (!vars.announce) return;
      const line = cart.items.find((l) => l.variant_id === vars.variant_id);
      // One toast per variant: repeat adds refresh it instead of stacking.
      toast(`Added ${line?.product_name ?? "to your bag"}`, {
        id: `add-${vars.variant_id}`,
        description: line ? optionSummary(line) || undefined : undefined,
        action: {
          label: "View bag",
          onClick: () => useBagDrawer.getState().setOpen(true),
        },
      });
    },
  });

  const update = useMutation({
    mutationKey,
    mutationFn: async (vars: { variantId: string; quantity: number }) => {
      const { data } = await updateCartItem({
        path: { variantID: vars.variantId },
        body: { quantity: vars.quantity },
        throwOnError: true,
      });
      return data.data;
    },
    onMutate: ({ variantId, quantity }) =>
      optimistic((cart) => setLineQuantity(cart, variantId, quantity)),
    onError: (error, _vars, context) => rollback(error, context),
    onSuccess: settle,
  });

  const remove = useMutation({
    mutationKey,
    mutationFn: async (line: CartLine) => {
      const { data } = await removeCartItem({
        path: { variantID: line.variant_id },
        throwOnError: true,
      });
      return data.data;
    },
    onMutate: (line) => optimistic((cart) => removeLine(cart, line.variant_id)),
    onError: (error, _line, context) => rollback(error, context),
    onSuccess: (cart, line) => {
      settle(cart);
      toast(`Removed ${line.product_name}`, {
        action: {
          label: "Undo",
          onClick: () =>
            add.mutate({
              variant_id: line.variant_id,
              quantity: line.quantity,
              preview: line,
            }),
        },
      });
    },
  });

  return { add, update, remove };
}
