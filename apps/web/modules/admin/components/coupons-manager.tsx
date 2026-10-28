"use client";

import { useEffect, useState } from "react";
import {
  DotsThreeIcon,
  PencilSimpleIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { AdminCoupon, CouponBody, CouponKind } from "@repo/types";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminCreateCoupon,
  adminDeleteCoupon,
  adminSetCouponActive,
  adminUpdateCoupon,
} from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { withoutErrors } from "@/lib/forms";
import { formatPriceShort } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import {
  COUPON_STATUS_LABELS,
  couponStatus,
  couponUses,
  couponValue,
  couponValues,
  couponWindow,
  EMPTY_COUPON,
  parseCouponValues,
  type CouponStatus,
  type CouponValues,
} from "../lib/coupons";
import { useAdminCoupons } from "../queries";
import { PageNav } from "./page-nav";
import { ToggleField } from "./product-form";

const PATH = "/admin/coupons";
const COLUMNS = 8;

const tone: Record<CouponStatus, string> = {
  active: "border-success/40 text-success",
  scheduled: "border-border text-foreground",
  expired: "border-border text-muted-foreground",
  "used-up": "border-clay/40 text-clay",
  off: "border-border text-muted-foreground",
};

type Editing = { mode: "create" } | { mode: "edit"; coupon: AdminCoupon };

/**
 * Discount codes: what each takes off, its limits and how often it's been
 * used, with a switch to turn it on or off. A code nobody has used can be
 * deleted; one that was stays, switched off, so its orders keep their
 * record.
 */
export function CouponsManager({ initialPage }: { initialPage: number }) {
  const [page, setPage] = useState(initialPage);
  const coupons = useAdminCoupons(page);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<AdminCoupon | null>(null);

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      page > 1 ? `${PATH}?page=${page}` : PATH,
    );
  }, [page]);

  const outOfRange =
    coupons.isError &&
    getApiError(coupons.error)?.code === "INVALID_PAGE_PARAMETER";
  useEffect(() => {
    if (outOfRange && page > 1) setPage(1);
  }, [outOfRange, page]);

  const remove = useAdminMutation({
    mutationFn: async (coupon: AdminCoupon) => {
      await adminDeleteCoupon({
        path: { couponID: coupon.id },
        throwOnError: true,
      });
    },
    success: (_, c) => `${c.code} was deleted`,
    failure: "Couldn't delete the coupon.",
    invalidate: [adminKeys.coupons()],
    // A refusal (used since the page loaded) is toasted; close either way.
    onSuccess: () => setDeleting(null),
  });

  const rows = coupons.data?.data ?? [];
  const meta = coupons.data?.meta;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {meta && `${meta.total} ${meta.total === 1 ? "code" : "codes"}`}
        </p>
        <Button onClick={() => setEditing({ mode: "create" })}>
          <PlusIcon data-icon="inline-start" />
          New coupon
        </Button>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-panel border border-border transition-opacity",
          coupons.isPlaceholderData && "opacity-60",
        )}
      >
        <Table className="md:min-w-[56rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead className="hidden md:table-cell">Min. order</TableHead>
              <TableHead className="hidden lg:table-cell">Valid</TableHead>
              <TableHead className="text-right">Uses</TableHead>
              <TableHead className="hidden md:table-cell">Once each</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.isPending ? (
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={COLUMNS}>
                    <Skeleton className="h-9" />
                  </TableCell>
                </TableRow>
              ))
            ) : coupons.isError && !outOfRange ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMNS} className="py-16 text-center">
                  <p className="mb-4 text-sm text-muted-foreground">
                    The coupons couldn&apos;t load.
                  </p>
                  <Button variant="outline" onClick={() => coupons.refetch()}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMNS} className="py-16 text-center">
                  <TagIcon
                    className="mx-auto size-8 text-muted-foreground"
                    weight="light"
                  />
                  <p className="mt-4 font-serif text-2xl">No coupons yet.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Shoppers enter a code in their bag for a percentage or an
                    amount off.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((coupon) => (
                <CouponRow
                  key={coupon.id}
                  coupon={coupon}
                  onEdit={() => setEditing({ mode: "edit", coupon })}
                  onDelete={() => setDeleting(coupon)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && (
        <PageNav
          page={meta.page}
          totalPages={meta.total_pages}
          href={(p) => (p > 1 ? `${PATH}?page=${p}` : PATH)}
          onPage={(p) => {
            setPage(p);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      <CouponDialog editing={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this coupon?"
        description={
          deleting && (
            <>
              <span className="font-mono text-foreground">{deleting.code}</span>{" "}
              stops working at once, and bags holding it show it as no longer
              valid.
            </>
          )
        }
        confirmLabel="Delete coupon"
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting, { onError: () => setDeleting(null) })
        }
      />
    </div>
  );
}

function CouponRow({
  coupon,
  onEdit,
  onDelete,
}: {
  coupon: AdminCoupon;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = couponStatus(coupon);
  const toggle = useAdminMutation({
    mutationFn: async (isActive: boolean) => {
      const { data } = await adminSetCouponActive({
        path: { couponID: coupon.id },
        body: { is_active: isActive },
        throwOnError: true,
      });
      return data.data;
    },
    success: (c) =>
      c.is_active ? `${c.code} is on` : `${c.code} is off: it can't be used`,
    failure: "Couldn't switch the coupon.",
    invalidate: [adminKeys.coupons()],
  });
  // Shows the switch's new place while the API answers.
  const active = toggle.isPending ? toggle.variables : coupon.is_active;
  const used = coupon.redemptions > 0;

  return (
    <TableRow>
      <TableCell className="font-mono text-[0.8125rem] tracking-[0.06em]">
        {coupon.code}
      </TableCell>
      <TableCell className="whitespace-nowrap">{couponValue(coupon)}</TableCell>
      <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
        {coupon.min_subtotal > 0 ? formatPriceShort(coupon.min_subtotal) : "—"}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
        {couponWindow(coupon)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {couponUses(coupon)}
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">
        {coupon.once_per_customer ? "Yes" : "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Switch
            checked={active}
            onCheckedChange={(next) => toggle.mutate(next)}
            disabled={toggle.isPending}
            aria-label={`${coupon.code} on`}
          />
          <span
            className={cn(
              "inline-flex h-5 items-center border px-1.5 font-mono text-[0.5625rem] tracking-[0.14em] whitespace-nowrap uppercase",
              tone[status],
            )}
          >
            {COUPON_STATUS_LABELS[status]}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label={`Actions for ${coupon.code}`}
          >
            <DotsThreeIcon className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 p-1">
            <DropdownMenuItem onClick={onEdit}>
              <PencilSimpleIcon />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={used}
              onClick={onDelete}
            >
              <TrashIcon />
              {used ? "Used, so it can't be deleted" : "Delete"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function CouponDialog({
  editing,
  onClose,
}: {
  editing: Editing | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const key =
    editing === null
      ? "closed"
      : editing.mode === "edit"
        ? editing.coupon.id
        : "new";
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <DialogContent className="max-h-[92svh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {editing && (
          <CouponForm
            key={key}
            coupon={editing.mode === "edit" ? editing.coupon : null}
            onBusyChange={setBusy}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CouponForm({
  coupon,
  onBusyChange,
  onDone,
}: {
  coupon: AdminCoupon | null;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState<CouponValues>(
    coupon ? couponValues(coupon) : EMPTY_COUPON,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useAdminMutation({
    mutationFn: async (body: CouponBody) => {
      if (coupon) {
        await adminUpdateCoupon({
          path: { couponID: coupon.id },
          body,
          throwOnError: true,
        });
      } else {
        await adminCreateCoupon({ body, throwOnError: true });
      }
    },
    quietOnFieldErrors: true,
    failure: "Couldn't save the coupon.",
    success: (_, body) =>
      coupon ? `${body.code} saved` : `${body.code} added`,
    invalidate: [adminKeys.coupons()],
    onSuccess: () => {
      onBusyChange(false);
      onDone();
    },
  });

  /** Sets fields, clearing the errors of the body fields they feed. */
  function change(patch: Partial<CouponValues>, ...fields: string[]) {
    setValues((v) => ({ ...v, ...patch }));
    setErrors((e) => withoutErrors(e, ...fields));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseCouponValues(values);
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    onBusyChange(true);
    save.mutate(parsed.body, {
      onError: (error) => {
        onBusyChange(false);
        setErrors(mapFieldErrors(getApiError(error)?.errors));
      },
    });
  }

  const percent = values.kind === "percent";
  const used = (coupon?.redemptions ?? 0) > 0;

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader className="gap-1 border-b border-border px-6 py-5">
        <DialogTitle className="font-serif text-2xl font-normal">
          {coupon ? `Edit ${coupon.code}` : "New coupon"}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {used
            ? `Used ${coupon!.redemptions} ${coupon!.redemptions === 1 ? "time" : "times"}. Those orders keep the discount they got; changes apply from now on.`
            : "Takes a percentage or an amount off the whole bag, sale prices included. One code per order."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.code)}>
            <FieldLabel
              htmlFor="coupon-edit-code"
              className="eyebrow !text-foreground"
            >
              Code
            </FieldLabel>
            <Input
              id="coupon-edit-code"
              value={values.code}
              onChange={(e) => change({ code: e.target.value }, "code")}
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase"
              aria-invalid={Boolean(errors.code)}
            />
            <FieldError>{errors.code}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.value)}>
            <FieldLabel
              htmlFor="coupon-amount"
              className="eyebrow !text-foreground"
            >
              Discount
            </FieldLabel>
            <div className="flex gap-2">
              <div
                role="radiogroup"
                aria-label="Kind of discount"
                className="flex shrink-0 rounded-field border border-input p-0.5"
              >
                {(
                  [
                    ["percent", "%"],
                    ["fixed", "€"],
                  ] as [CouponKind, string][]
                ).map(([kind, sign]) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={values.kind === kind}
                    aria-label={kind === "percent" ? "Percentage" : "Amount"}
                    onClick={() => change({ kind }, "value", "kind")}
                    className="h-full w-9 rounded-field text-sm text-muted-foreground transition-colors aria-checked:bg-foreground aria-checked:text-background"
                  >
                    {sign}
                  </button>
                ))}
              </div>
              <Input
                id="coupon-amount"
                inputMode={percent ? "numeric" : "decimal"}
                value={values.amount}
                placeholder={percent ? "10" : "5.00"}
                onChange={(e) =>
                  change(
                    {
                      amount: e.target.value
                        .replace(percent ? /\D/g : /[^\d.]/g, "")
                        .slice(0, 10),
                    },
                    "value",
                  )
                }
                className="tabular-nums"
                aria-invalid={Boolean(errors.value)}
              />
            </div>
            <FieldError>{errors.value ?? errors.kind}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.min_subtotal)}>
            <FieldLabel
              htmlFor="coupon-minimum"
              className="eyebrow !text-foreground"
            >
              Minimum order
              <Optional />
            </FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                €
              </span>
              <Input
                id="coupon-minimum"
                inputMode="decimal"
                value={values.minimum}
                onChange={(e) =>
                  change(
                    {
                      minimum: e.target.value
                        .replace(/[^\d.]/g, "")
                        .slice(0, 10),
                    },
                    "min_subtotal",
                  )
                }
                className="pl-7 tabular-nums"
                aria-invalid={Boolean(errors.min_subtotal)}
              />
            </div>
            <FieldError>{errors.min_subtotal}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.max_redemptions)}>
            <FieldLabel
              htmlFor="coupon-uses"
              className="eyebrow !text-foreground"
            >
              Total uses
              <Optional />
            </FieldLabel>
            <Input
              id="coupon-uses"
              inputMode="numeric"
              value={values.maxUses}
              placeholder="No limit"
              onChange={(e) =>
                change(
                  { maxUses: e.target.value.replace(/\D/g, "").slice(0, 7) },
                  "max_redemptions",
                )
              }
              className="tabular-nums"
              aria-invalid={Boolean(errors.max_redemptions)}
            />
            <FieldError>{errors.max_redemptions}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.starts_at)}>
            <FieldLabel
              htmlFor="coupon-starts"
              className="eyebrow !text-foreground"
            >
              Starts
              <Optional />
            </FieldLabel>
            <Input
              id="coupon-starts"
              type="datetime-local"
              value={values.startsAt}
              onChange={(e) =>
                change({ startsAt: e.target.value }, "starts_at")
              }
              aria-invalid={Boolean(errors.starts_at)}
            />
            <FieldError>{errors.starts_at}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.ends_at)}>
            <FieldLabel
              htmlFor="coupon-ends"
              className="eyebrow !text-foreground"
            >
              Ends
              <Optional />
            </FieldLabel>
            <Input
              id="coupon-ends"
              type="datetime-local"
              value={values.endsAt}
              min={values.startsAt || undefined}
              onChange={(e) => change({ endsAt: e.target.value }, "ends_at")}
              aria-invalid={Boolean(errors.ends_at)}
            />
            <FieldError>{errors.ends_at}</FieldError>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <ToggleField
            id="coupon-once"
            label="Once per customer"
            description="Each email address can use it on one order."
            checked={values.oncePerCustomer}
            onChange={(oncePerCustomer) => change({ oncePerCustomer })}
          />
          <ToggleField
            id="coupon-active"
            label="On"
            description="Off, it can't be applied or checked out with."
            checked={values.isActive}
            onChange={(isActive) => change({ isActive })}
          />
        </div>
      </div>

      <DialogFooter className="sticky bottom-0 border-t border-border bg-popover px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={save.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : coupon ? "Save coupon" : "Add coupon"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Optional() {
  return (
    <span className="ml-1 tracking-normal normal-case text-muted-foreground">
      (optional)
    </span>
  );
}
