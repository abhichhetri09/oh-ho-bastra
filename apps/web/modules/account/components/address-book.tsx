"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Address, MAX_ADDRESSES } from "@repo/types";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteAddress, setDefaultAddress } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { DefaultTag } from "@/modules/checkout/components/default-tag";
import { addressKeys } from "@/modules/checkout/keys";
import { countryName } from "@/modules/checkout/lib/countries";
import { useAddresses } from "@/modules/checkout/queries";

/**
 * The addresses saved at checkout, the default first, then the newest.
 * Here one is made the default (checkout picks it first) or deleted: checkout
 * saves at most MAX_ADDRESSES, so this is where room is made for more.
 */
export function AddressBook() {
  const query = useAddresses();
  const queryClient = useQueryClient();
  const userId = useAuth((s) => s.user?.id ?? "");
  const [confirming, setConfirming] = useState<Address | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteAddress({ path: { addressID: id }, throwOnError: true });
    },
    onSuccess: () => {
      setConfirming(null);
      toast("Address removed");
      void queryClient.invalidateQueries({
        queryKey: addressKeys.mine(userId),
      });
    },
    onError: (error) => {
      setConfirming(null);
      toast.error(
        getApiError(error)?.message ?? "Couldn't remove the address.",
      );
    },
  });

  const makeDefault = useMutation({
    mutationFn: async (id: string) => {
      await setDefaultAddress({ path: { addressID: id }, throwOnError: true });
    },
    // Stays pending until the list comes back in its new order.
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: addressKeys.mine(userId),
      });
      toast("Default address updated");
    },
    onError: (error) => {
      toast.error(
        getApiError(error)?.message ?? "Couldn't change the default address.",
      );
    },
  });

  const addresses = query.data ?? [];

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <p className="eyebrow animate-rise">Addresses</p>
          <h1
            className="display animate-rise text-5xl sm:text-6xl"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            Where it <em>goes.</em>
          </h1>
        </div>
        {addresses.length > 0 && (
          <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
            {addresses.length} of {MAX_ADDRESSES} saved
          </p>
        )}
      </header>

      {query.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          eyebrow="Something went wrong"
          title="We couldn't load your addresses."
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : addresses.length === 0 ? (
        <EmptyState
          eyebrow="Nothing saved yet"
          title="No saved addresses."
          action={
            <Link href="/shop" className={buttonVariants()}>
              Start shopping
            </Link>
          }
        >
          Tick &ldquo;Save this address&rdquo; at checkout and it&apos;ll be
          here, ready for next time.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="flex flex-col justify-between gap-6 rounded-panel border border-border p-5"
            >
              <address className="space-y-0.5 text-sm not-italic">
                <p className="flex items-center gap-2 font-medium">
                  {a.full_name}
                  {a.is_default && <DefaultTag />}
                </p>
                <p>
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                </p>
                <p>
                  {a.city}
                  {a.region ? `, ${a.region}` : ""} {a.postal_code}
                </p>
                <p>{countryName(a.country)}</p>
                <p className="pt-1 text-muted-foreground">{a.phone}</p>
              </address>
              <div className="-my-2 flex gap-5 text-xs text-muted-foreground">
                {!a.is_default && (
                  <button
                    type="button"
                    onClick={() => makeDefault.mutate(a.id)}
                    disabled={makeDefault.isPending}
                    aria-label={`Make the address for ${a.full_name} the default`}
                    className="link-underline py-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
                  >
                    {makeDefault.isPending && makeDefault.variables === a.id
                      ? "Saving…"
                      : "Make default"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirming(a)}
                  className="link-underline py-2 hover:text-destructive"
                >
                  Remove
                  <span className="sr-only">
                    {" "}
                    the address for {a.full_name}
                  </span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Remove this address?"
        description={
          confirming
            ? `${confirming.full_name}, ${confirming.line1}, ${confirming.city}. Past orders keep their own copy.`
            : ""
        }
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={remove.isPending}
        onConfirm={() => confirming && remove.mutate(confirming.id)}
      />
    </div>
  );
}
