"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import type { AdminOrderDetail } from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { optionSummary } from "@/modules/cart/lib/cart-math";
import { orderLabel } from "@/modules/checkout/lib/orders";
import { previewRefund } from "../lib/refund-math";

/** What the dialog sends (the API's RefundOrderBody). */
export interface RefundBody {
  request_id: string;
  restock: boolean;
  items: { item_id: string; quantity: number }[];
  shipping: boolean;
  extra: number;
  note: string;
}

/**
 * Refunds part of an order or the rest of it: units per line, the
 * shipping, a goodwill amount, restock, and a note. The preview is the
 * API's own math, split between card and store credit as the order was
 * paid. The request id is made when the dialog opens and kept across
 * retries, so a double click or a retry after an error refunds once.
 */
export function RefundDialog({
  order: o,
  open,
  onOpenChange,
  pending,
  onRefund,
}: {
  order: AdminOrderDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onRefund: (body: RefundBody) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto p-6 sm:max-w-lg">
        {/* Remounted each time it opens: a fresh draft and request id. */}
        {open && (
          <RefundForm
            order={o}
            pending={pending}
            onCancel={() => onOpenChange(false)}
            onRefund={onRefund}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RefundForm({
  order: o,
  pending,
  onCancel,
  onRefund,
}: {
  order: AdminOrderDetail;
  pending: boolean;
  onCancel: () => void;
  onRefund: (body: RefundBody) => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [shipping, setShipping] = useState(false);
  const [extraText, setExtraText] = useState("");
  // Stock goes back by default only if nothing left the shop.
  const [restock, setRestock] = useState(o.shipped_at === null);
  const [note, setNote] = useState("");

  const extra = extraText.trim() === "" ? 0 : toCents(extraText);
  const p = previewRefund(o, {
    quantities,
    shipping,
    extra: extra ?? 0,
  });
  const anyUnits = p.lines.some((l) => l.quantity > 0);
  const invalid = extra === null || p.tooMuch || p.empty;

  const setQty = (id: string, q: number) =>
    setQuantities((prev) => ({ ...prev, [id]: q }));
  const everything = () => {
    setQuantities(Object.fromEntries(p.lines.map((l) => [l.id, l.left])));
    setShipping(!p.shippingRefunded && o.shipping > 0);
  };

  return (
    <>
      <DialogHeader className="gap-2">
        <DialogTitle className="font-serif text-2xl font-normal">
          Refund {orderLabel(o.number)}
        </DialogTitle>
        <DialogDescription className="text-[0.8125rem] leading-relaxed">
          {formatPrice(p.left)} is left to refund. Choose what goes back; the
          money returns the way the customer paid. This can&apos;t be undone.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[0.8125rem] font-medium">Items</p>
          <Button variant="ghost" size="xs" onClick={everything}>
            Select everything left
          </Button>
        </div>
        <ul className="divide-y divide-border rounded-panel border border-border">
          {o.items.map((item, i) => {
            const line = p.lines[i]!;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 px-3 py-2.5 text-[0.8125rem]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.options.length > 0 && `${optionSummary(item)} · `}
                    {line.left === 0
                      ? "All refunded"
                      : `${line.left} of ${item.quantity} left`}
                  </p>
                </div>
                <Stepper
                  label={item.product_name}
                  value={line.quantity}
                  max={line.left}
                  disabled={pending}
                  onChange={(q) => setQty(item.id, q)}
                />
                <span className="w-16 text-right tabular-nums">
                  {line.quantity > 0 ? formatPrice(line.amount) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-3">
        {o.shipping > 0 && (
          <Field
            orientation="horizontal"
            className="items-center justify-between gap-4 rounded-panel border border-border px-4 py-3"
          >
            <div className="space-y-0.5">
              <FieldLabel
                htmlFor="refund-shipping"
                className="text-[0.8125rem]"
              >
                Refund the shipping ({formatPrice(o.shipping)})
              </FieldLabel>
              {p.shippingRefunded && (
                <FieldDescription className="text-xs">
                  Refunded already.
                </FieldDescription>
              )}
            </div>
            <Switch
              id="refund-shipping"
              checked={shipping && !p.shippingRefunded}
              disabled={p.shippingRefunded || pending}
              onCheckedChange={setShipping}
            />
          </Field>
        )}
        <Field
          orientation="horizontal"
          className="items-start justify-between gap-4 rounded-panel border border-border px-4 py-3"
        >
          <div className="space-y-0.5">
            <FieldLabel htmlFor="refund-restock" className="text-[0.8125rem]">
              Return these items to stock
            </FieldLabel>
            <FieldDescription className="text-xs">
              {o.shipped_at === null
                ? "Nothing has shipped, so they can be sold again."
                : "Only if they came back and can be sold again."}
            </FieldDescription>
          </div>
          <Switch
            id="refund-restock"
            checked={restock}
            disabled={!anyUnits || pending}
            onCheckedChange={setRestock}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="refund-extra" className="text-[0.8125rem]">
            Goodwill amount (optional)
          </FieldLabel>
          <Input
            id="refund-extra"
            inputMode="decimal"
            placeholder="0.00"
            value={extraText}
            onChange={(e) => setExtraText(e.target.value)}
            aria-invalid={extra === null || p.tooMuch}
            className="h-9 tabular-nums sm:max-w-40"
            disabled={pending}
          />
          {(extra === null || p.tooMuch) && (
            <FieldDescription className="text-xs text-destructive">
              {extra === null
                ? "Enter an amount like 5 or 4.50."
                : `That's more than the ${formatPrice(p.left)} left to refund.`}
            </FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="refund-note" className="text-[0.8125rem]">
            Reason
          </FieldLabel>
          <Textarea
            id="refund-note"
            value={note}
            maxLength={500}
            rows={2}
            placeholder="e.g. Arrived damaged, returned unworn"
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
          />
          <FieldDescription className="text-xs">
            Kept with the refund for the team; the customer doesn&apos;t see it.
          </FieldDescription>
        </Field>
      </div>

      <dl className="space-y-1.5 rounded-panel bg-surface px-4 py-3 text-[0.8125rem]">
        {p.items > 0 && <Row label="Items" value={p.items} />}
        {p.shipping > 0 && <Row label="Shipping" value={p.shipping} />}
        {(extra ?? 0) > 0 && <Row label="Goodwill" value={extra ?? 0} />}
        <div className="flex items-baseline justify-between border-t border-border pt-2">
          <dt className="font-medium">Refund</dt>
          <dd className="text-base font-medium tabular-nums">
            {formatPrice(p.total)}
          </dd>
        </div>
        {p.total > 0 && (
          <>
            <Row label="To the card, through Stripe" value={p.card} muted />
            {(o.credit > 0 || p.credit > 0) && (
              <Row label="As store credit" value={p.credit} muted />
            )}
          </>
        )}
      </dl>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={pending || invalid}
          onClick={() =>
            onRefund({
              request_id: requestId,
              restock: anyUnits && restock,
              items: p.lines
                .filter((l) => l.quantity > 0)
                .map((l) => ({ item_id: l.id, quantity: l.quantity })),
              shipping: shipping && !p.shippingRefunded,
              extra: extra ?? 0,
              note: note.trim(),
            })
          }
        >
          {pending
            ? "Refunding…"
            : p.total === p.left && p.total > 0
              ? `Refund ${formatPrice(p.total)}, the rest`
              : `Refund ${formatPrice(p.total)}`}
        </Button>
      </DialogFooter>
    </>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-3",
        muted && "text-xs text-muted-foreground",
      )}
    >
      <dt className={muted ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{formatPrice(value)}</dd>
    </div>
  );
}

/** A small − n + control, 0 to max. */
function Stepper({
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={`One fewer ${label}`}
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
      >
        <MinusIcon />
      </Button>
      <span className="w-6 text-center tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={`One more ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
