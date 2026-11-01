"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MagnifyingGlassIcon, WalletIcon } from "@phosphor-icons/react";
import type { CreditAccount, CreditKind, CreditRedemption } from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  adminAdjustCredit,
  adminConfirmCreditRedemption,
  adminStartCreditRedemption,
} from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { formatPrice, toCents } from "@/lib/money";
import { creditFor } from "@/lib/referrals";
import { cn } from "@/lib/utils";
import { formatOrderDate } from "@/modules/checkout/lib/orders";
import { adminKeys } from "../keys";
import { useCreditAccount, useCreditSearch } from "../queries";

const KIND: Record<CreditKind, string> = {
  earned: "Referral",
  spent: "Spent",
  expired: "Expired",
  adjusted: "Adjusted",
  reversed: "Refunded",
};

/**
 * The counter's store credit desk: find a customer by name or email, see
 * their balance and ledger, take credit off an in-store bill (the customer
 * reads out a code they're emailed), or adjust it by hand with a note.
 */
export function StoreCredit() {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const search = useCreditSearch(q);
  const account = useCreditAccount(picked);

  return (
    <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or email"
            aria-label="Find a customer"
            className="pl-9"
          />
        </div>
        {q.trim().length >= 2 && (
          <ul
            className="divide-y divide-border rounded-panel border border-border"
            aria-live="polite"
          >
            {search.isPending ? (
              <li className="p-3">
                <Skeleton className="h-8" />
              </li>
            ) : (search.data ?? []).length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">
                No customer matches.
              </li>
            ) : (
              search.data?.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(c.id)}
                    aria-current={picked === c.id || undefined}
                    className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted aria-[current=true]:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.email}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatPrice(c.balance)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {picked === null ? (
        <div className="flex flex-col items-center justify-center rounded-panel border border-dashed border-border py-16 text-center">
          <WalletIcon className="size-8 text-muted-foreground" weight="light" />
          <p className="mt-4 font-serif text-2xl">Find a customer.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Search by name or email to see and use their store credit.
          </p>
        </div>
      ) : account.isPending ? (
        <Skeleton className="h-80" />
      ) : account.isError ? (
        <div className="rounded-panel border border-border py-16 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Their store credit couldn&apos;t load.
          </p>
          <Button variant="outline" onClick={() => account.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <Account account={account.data} />
      )}
    </div>
  );
}

function Account({ account }: { account: CreditAccount }) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-panel border border-border p-5">
        <div className="min-w-0">
          <p className="truncate font-medium">{account.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {account.email}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl tabular-nums">
            {formatPrice(account.balance)}
          </p>
          {account.available < account.balance && (
            <p className="text-xs text-muted-foreground">
              {formatPrice(account.available)} free; the rest is held by an
              unpaid checkout
            </p>
          )}
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <RedeemForm key={`redeem-${account.id}`} account={account} />
        <AdjustForm key={`adjust-${account.id}`} account={account} />
      </div>
      <Ledger account={account} />
    </div>
  );
}

/** After a change, the account and the search results show it. */
function useRefreshCredit() {
  const queryClient = useQueryClient();
  return (account: CreditAccount) => {
    queryClient.setQueryData(adminKeys.creditAccount(account.id), account);
    void queryClient.invalidateQueries({ queryKey: adminKeys.credit() });
  };
}

/**
 * Credit off an in-store bill: the bill and the credit (at most the
 * store's share of the bill), then the code the customer was emailed.
 */
function RedeemForm({ account }: { account: CreditAccount }) {
  const refresh = useRefreshCredit();
  const [bill, setBill] = useState("");
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<CreditRedemption | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const billCents = toCents(bill);
  // The most the bill takes: the store's share, never all of it.
  const max =
    billCents === null
      ? null
      : creditFor(account.available, account.max_percent, {
          subtotal: billCents,
          discount: 0,
          total: billCents,
        });

  const start = useMutation({
    mutationFn: async (body: { bill: number; amount: number }) => {
      const { data } = await adminStartCreditRedemption({
        path: { userID: account.id },
        body,
        throwOnError: true,
      });
      return data.data;
    },
    onSuccess: (redemption) => {
      setPending(redemption);
      setErrors({});
      toast.success(`Code emailed to ${account.email}`);
    },
    onError: (error) => {
      const api = getApiError(error);
      setErrors(mapFieldErrors(api?.errors));
      toast.error(api?.message ?? "Couldn't send the code. Try again.");
    },
  });

  const confirm = useMutation({
    mutationFn: async (vars: { id: string; code: string }) => {
      const { data } = await adminConfirmCreditRedemption({
        path: { redemptionID: vars.id },
        body: { code: vars.code },
        throwOnError: true,
      });
      return data.data;
    },
    onSuccess: (next) => {
      toast.success(
        `${formatPrice(pending?.amount ?? 0)} of credit used. Take the rest as usual.`,
      );
      setPending(null);
      setBill("");
      setAmount("");
      setCode("");
      refresh(next);
    },
    onError: (error) => {
      const api = getApiError(error);
      // A dead code needs a new one: back to the amount.
      if (api?.code === "CREDIT_CODE_EXPIRED") setPending(null);
      setErrors({ code: api?.message ?? "Couldn't confirm. Try again." });
    },
  });

  function send(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = toCents(amount);
    const next: Record<string, string> = {};
    if (billCents === null || billCents === 0)
      next.bill = "Enter the bill's total, like 42.50";
    if (amountCents === null || amountCents === 0)
      next.amount = "Enter the credit to use, like 10";
    else if (max !== null && amountCents > max)
      next.amount = `Up to ${formatPrice(max)} on this bill`;
    setErrors(next);
    if (Object.keys(next).length > 0 || billCents === null || !amountCents)
      return;
    start.mutate({ bill: billCents, amount: amountCents });
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: "Enter the 6 digits from the customer's email" });
      return;
    }
    confirm.mutate({ id: pending.id, code });
  }

  return (
    <section className="space-y-4 rounded-panel border border-border p-5">
      <h2 className="eyebrow">Use in store</h2>
      {pending ? (
        <form onSubmit={submitCode} noValidate className="space-y-4">
          <p className="text-sm">
            {formatPrice(pending.amount)} off a bill of{" "}
            {formatPrice(pending.bill)}. Ask the customer for the code we just
            emailed them.
          </p>
          <Field data-invalid={Boolean(errors.code)}>
            <FieldLabel htmlFor="credit-code">Code</FieldLabel>
            <Input
              id="credit-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              aria-invalid={Boolean(errors.code)}
              className="font-mono tracking-[0.3em]"
            />
            {errors.code && <FieldError>{errors.code}</FieldError>}
          </Field>
          <div className="flex gap-3">
            <Button type="submit" disabled={confirm.isPending}>
              {confirm.isPending ? "Confirming…" : "Confirm"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPending(null);
                setErrors({});
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={send} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.bill)}>
              <FieldLabel htmlFor="credit-bill">Bill (€)</FieldLabel>
              <Input
                id="credit-bill"
                inputMode="decimal"
                value={bill}
                onChange={(e) => setBill(e.target.value.replace(/[^\d.]/g, ""))}
                aria-invalid={Boolean(errors.bill)}
                className="tabular-nums"
              />
              {errors.bill && <FieldError>{errors.bill}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(errors.amount)}>
              <FieldLabel htmlFor="credit-amount">Credit to use (€)</FieldLabel>
              <Input
                id="credit-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d.]/g, ""))
                }
                aria-invalid={Boolean(errors.amount)}
                className="tabular-nums"
              />
              {errors.amount ? (
                <FieldError>{errors.amount}</FieldError>
              ) : (
                <FieldDescription className="text-xs">
                  {max === null
                    ? `Up to ${account.max_percent}% of the bill.`
                    : `Up to ${formatPrice(max)} on this bill.`}
                </FieldDescription>
              )}
            </Field>
          </div>
          <Button
            type="submit"
            disabled={start.isPending || account.available === 0}
          >
            {start.isPending ? "Sending…" : "Email the customer a code"}
          </Button>
        </form>
      )}
    </section>
  );
}

/** Credit added or taken off by hand, with the reason. */
function AdjustForm({ account }: { account: CreditAccount }) {
  const refresh = useRefreshCredit();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const adjust = useMutation({
    mutationFn: async (body: { amount: number; note: string }) => {
      const { data } = await adminAdjustCredit({
        path: { userID: account.id },
        body,
        throwOnError: true,
      });
      return data.data;
    },
    onSuccess: (next) => {
      toast.success("Store credit adjusted");
      setAmount("");
      setNote("");
      setErrors({});
      refresh(next);
    },
    onError: (error) => {
      const api = getApiError(error);
      setErrors(mapFieldErrors(api?.errors));
      toast.error(api?.message ?? "Couldn't adjust the credit. Try again.");
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const negative = amount.trim().startsWith("-");
    const cents = toCents(amount.trim().replace(/^-/, ""));
    const next: Record<string, string> = {};
    if (cents === null || cents === 0)
      next.amount = "Enter an amount, like 5 to add or -5 to take off";
    if (!note.trim()) next.note = "Say why, for the record";
    setErrors(next);
    if (Object.keys(next).length > 0 || cents === null) return;
    adjust.mutate({ amount: negative ? -cents : cents, note: note.trim() });
  }

  return (
    <section className="space-y-4 rounded-panel border border-border p-5">
      <h2 className="eyebrow">Adjust</h2>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="credit-adjust">Amount (€)</FieldLabel>
          <Input
            id="credit-adjust"
            inputMode="decimal"
            value={amount}
            placeholder="5, or -5 to take off"
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.-]/g, ""))}
            aria-invalid={Boolean(errors.amount)}
            className="tabular-nums"
          />
          {errors.amount && <FieldError>{errors.amount}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.note)}>
          <FieldLabel htmlFor="credit-note">Why</FieldLabel>
          <Textarea
            id="credit-note"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={Boolean(errors.note)}
            rows={2}
          />
          {errors.note && <FieldError>{errors.note}</FieldError>}
        </Field>
        <Button type="submit" variant="outline" disabled={adjust.isPending}>
          {adjust.isPending ? "Saving…" : "Adjust credit"}
        </Button>
      </form>
    </section>
  );
}

function Ledger({ account }: { account: CreditAccount }) {
  if (account.entries.length === 0)
    return (
      <p className="text-sm text-muted-foreground">No store credit yet.</p>
    );
  return (
    <section className="space-y-3">
      <h2 className="eyebrow">History</h2>
      <ul className="divide-y divide-border rounded-panel border border-border">
        {account.entries.map((e) => (
          <li
            key={e.id}
            className="grid grid-cols-[6rem_1fr_auto] items-baseline gap-3 p-3 text-sm"
          >
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatOrderDate(e.created_at)}
            </span>
            <span className="min-w-0">
              {KIND[e.kind]}
              {e.note && (
                <span className="block truncate text-xs text-muted-foreground">
                  {e.note}
                </span>
              )}
              {e.expires_at && e.amount > 0 && (
                <span className="block text-xs text-muted-foreground">
                  Lapses {formatOrderDate(e.expires_at)}
                </span>
              )}
            </span>
            <span
              className={cn(
                "tabular-nums",
                e.amount > 0 ? "text-success" : "text-muted-foreground",
              )}
            >
              {e.amount > 0 ? "+" : "−"}
              {formatPrice(Math.abs(e.amount))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
