"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  LockSimpleIcon,
  PlusIcon,
  TruckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  AddressInputSchema,
  CheckoutEmailSchema,
  MAX_ADDRESSES,
  type Address,
  type Cart,
  type CheckoutBody,
} from "@repo/types";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFocusFirstError } from "@/hooks/use-focus-first-error";
import { useHydrated } from "@/hooks/use-hydrated";
import { removeCartReferral, startCheckout } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { loginPath } from "@/lib/auth/redirect";
import { friendlyFieldErrors } from "@/lib/forms";
import { formatDiscount, formatPrice } from "@/lib/money";
import { creditFor } from "@/lib/referrals";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { CartTotals } from "@/modules/cart/components/cart-summary";
import { cartKeys } from "@/modules/cart/keys";
import { optionSummary } from "@/modules/cart/lib/cart-math";
import { couponRefusalMessage, isCouponIssue } from "@/modules/cart/lib/coupon";
import { useCart } from "@/modules/cart/queries";
import { countryName } from "../lib/countries";
import { useAddresses, useMyCredit } from "../queries";
import { AddressForm, EMPTY_ADDRESS, type AddressValues } from "./address-form";
import { DefaultTag } from "./default-tag";

const NEW = "new";

/**
 * Checkout: who it's for, where it goes and what it costs. Paying hands
 * over to Stripe's hosted page, which returns to /checkout/success. A
 * guest (no account) gives the email its order emails go to and a new
 * address; nothing is saved for it.
 */
export function CheckoutView({ seeded }: { seeded: boolean }) {
  const hydrated = useHydrated();
  const user = useAuth((s) => s.user);
  const guest = user?.role === "guest";
  const cartQuery = useCart();
  const cart = seeded || hydrated ? cartQuery.data : undefined;
  const addresses = useAddresses();

  if (!cart && hydrated && cartQuery.isError) {
    return (
      <Shell>
        <EmptyState
          eyebrow="Something went wrong"
          title="We couldn't load your bag."
          action={
            <Button variant="outline" onClick={() => void cartQuery.refetch()}>
              Try again
            </Button>
          }
        />
      </Shell>
    );
  }

  if (!cart) {
    return (
      <Shell>
        <div className="grid gap-12 lg:grid-cols-[1fr_26rem]">
          <Skeleton className="h-96" />
          <Skeleton className="h-80" />
        </div>
      </Shell>
    );
  }

  if (cart.items.length === 0) {
    return (
      <Shell>
        <EmptyState
          eyebrow="Nothing to check out"
          title="Your bag is empty."
          action={
            <Link href="/shop" className={buttonVariants()}>
              Start shopping
            </Link>
          }
        />
      </Shell>
    );
  }

  if (cart.has_issues) {
    return (
      <Shell>
        <EmptyState
          eyebrow="Almost there"
          title="Some items in your bag need attention."
          action={
            <Link href="/cart" className={buttonVariants()}>
              Review your bag
            </Link>
          }
        >
          An item sold out or changed since you added it. Update your bag, then
          come back to check out.
        </EmptyState>
      </Shell>
    );
  }

  return (
    <Shell>
      <CheckoutForm
        cart={cart}
        guest={guest}
        email={user?.email ?? ""}
        saved={guest ? [] : addresses.data}
        savedLoading={!guest && addresses.isPending}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page pt-8 pb-24 sm:pt-14">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <h1 className="display animate-rise text-[clamp(3rem,6vw,5rem)]">
          Checkout.
        </h1>
        <ol className="flex items-center gap-3 font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
          {["Bag", "Details", "Payment"].map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              {i > 0 && <span className="h-px w-6 bg-border" aria-hidden />}
              {i === 0 ? (
                <Link
                  href="/cart"
                  className="link-underline text-muted-foreground hover:text-foreground"
                >
                  {step}
                </Link>
              ) : (
                <span
                  className={cn(
                    i === 1 ? "text-foreground" : "text-muted-foreground",
                  )}
                  aria-current={i === 1 ? "step" : undefined}
                >
                  {step}
                </span>
              )}
            </li>
          ))}
        </ol>
      </header>
      {children}
    </div>
  );
}

function CheckoutForm({
  cart,
  guest,
  email,
  saved,
  savedLoading,
}: {
  cart: Cart;
  /** No account: asks for the email, and saves no address. */
  guest: boolean;
  /** The account's email (a guest types its own). */
  email: string;
  saved: Address[] | undefined;
  savedLoading: boolean;
}) {
  const [guestEmail, setGuestEmail] = useState("");
  // Until the shopper picks, use the first saved address (the default, else
  // the newest) or a new one.
  const [picked, setPicked] = useState<string | null>(null);
  const choice = picked ?? saved?.[0]?.id ?? NEW;
  const [address, setAddress] = useState<AddressValues>(EMPTY_ADDRESS);
  const [save, setSave] = useState(true);
  // Ticked until the shopper says otherwise if they have no default yet.
  const [makeDefaultChoice, setMakeDefault] = useState<boolean | null>(null);
  const makeDefault = makeDefaultChoice ?? !saved?.some((a) => a.is_default);
  // The API saves no more than this many; past it, it ignores the box.
  const bookFull = (saved?.length ?? 0) >= MAX_ADDRESSES;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [redirecting, setRedirecting] = useState(false);
  // Why a friend's referral was taken off at checkout (it stopped applying
  // since the bag was read); the summary's total is the new one.
  const [dropped, setDropped] = useState<string | null>(null);
  // Store credit, for an account that has some: what checkout would use.
  const myCredit = useMyCredit();
  const [useCredit, setUseCredit] = useState(true);
  const credit =
    guest || !myCredit.data
      ? 0
      : creditFor(myCredit.data.available, myCredit.data.max_percent, cart);
  const creditUsed = useCredit ? credit : 0;
  const { ref: formRef, focusFirstError } = useFocusFirstError();
  const queryClient = useQueryClient();

  const checkout = useMutation({
    mutationFn: async (body: CheckoutBody) => {
      setDropped(null);
      // A referral the summary already says doesn't apply is taken off
      // first, so checkout goes ahead at the total shown.
      if (cart.referral?.issue)
        await removeCartReferral({ throwOnError: true });
      const { data } = await startCheckout({
        body: { ...body, use_credit: creditUsed > 0 || undefined },
        throwOnError: true,
      });
      return data.data;
    },
    onSuccess: ({ checkout_url }) => {
      setRedirecting(true);
      window.location.assign(checkout_url);
    },
    onError: (error) => {
      const apiError = getApiError(error);
      // Something sold out (or the bag emptied) since this page loaded:
      // the fresh cart switches the page to "Review your bag". A discount
      // code that stopped applying shows its reason in the summary.
      if (
        apiError?.code === "CART_HAS_ISSUES" ||
        apiError?.code === "CART_EMPTY" ||
        isCouponIssue(apiError?.code)
      ) {
        void queryClient.invalidateQueries({ queryKey: cartKeys.all });
      }
      if (apiError?.code.startsWith("REFERRAL_")) {
        // Taken off the bag by the API: the fresh cart has the new total.
        void queryClient.invalidateQueries({ queryKey: cartKeys.all });
        setDropped(apiError.message);
        toast.error(apiError.message);
        return;
      }
      if (apiError && isCouponIssue(apiError.code)) {
        toast.error(
          couponRefusalMessage(cart.coupon?.code ?? "", apiError.message),
        );
        return;
      }
      // Field errors come back as "address.city"; the form uses "city".
      const fields = mapFieldErrors(
        apiError?.errors?.map((e) => ({
          ...e,
          field: e.field?.replace(/^address\./, ""),
        })),
      );
      setErrors(fields);
      focusFirstError();
      toast.error(apiError?.message ?? "Couldn't start checkout. Try again.");
    },
  });

  function change(field: keyof AddressValues, value: string) {
    setAddress((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const rest = { ...current };
      delete rest[field];
      return rest;
    });
  }

  function changeEmail(value: string) {
    setGuestEmail(value);
    setErrors((current) => {
      if (!current.email) return current;
      const rest = { ...current };
      delete rest.email;
      return rest;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (choice !== NEW) {
      checkout.mutate({ address_id: choice });
      return;
    }
    const parsed = AddressInputSchema.safeParse({
      ...address,
      line2: address.line2 || undefined,
      region: address.region || undefined,
    });
    const parsedEmail = guest
      ? CheckoutEmailSchema.safeParse(guestEmail.trim())
      : null;
    if (!parsed.success || parsedEmail?.success === false) {
      setErrors({
        ...(parsed.success
          ? {}
          : friendlyFieldErrors(parsed.error, {
              full_name: "your full name",
              phone: "a phone number",
              line1: "your street address",
              city: "a city",
              postal_code: "a postal code",
              country: "a country",
            })),
        ...(parsedEmail?.success === false
          ? {
              email: guestEmail.trim()
                ? "Enter a valid email address"
                : "Enter your email address",
            }
          : {}),
      });
      focusFirstError();
      return;
    }
    setErrors({});
    if (parsedEmail) {
      // A guest saves nothing: it has no address book.
      checkout.mutate({ email: parsedEmail.data, address: parsed.data });
      return;
    }
    checkout.mutate({
      address: parsed.data,
      save_address: save && !bookFull,
      make_default: save && !bookFull && makeDefault,
    });
  }

  const busy = checkout.isPending || redirecting;

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="grid items-start gap-12 lg:grid-cols-[1fr_26rem] lg:gap-16"
    >
      <div className="space-y-12">
        <Section number={1} title="Contact">
          {guest ? (
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel
                htmlFor="checkout-email"
                className="eyebrow !text-foreground"
              >
                Email
              </FieldLabel>
              <Input
                id="checkout-email"
                name="email"
                type="email"
                autoComplete="email"
                value={guestEmail}
                onChange={(e) => changeEmail(e.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email ? "checkout-email-error" : undefined
                }
              />
              <FieldError
                key={errors.email}
                id="checkout-email-error"
                className="animate-rise"
              >
                {errors.email}
              </FieldError>
              <FieldDescription className="text-xs">
                Your receipt and shipping updates go here. Already have an
                account?{" "}
                <Link
                  href={loginPath("/checkout")}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Sign in
                </Link>
              </FieldDescription>
            </Field>
          ) : (
            <>
              <p className="text-sm">{email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your receipt and shipping updates go here.
              </p>
            </>
          )}
        </Section>

        <Section number={2} title="Shipping address">
          {savedLoading ? (
            <Skeleton className="h-28" />
          ) : (
            <div className="space-y-6">
              {saved && saved.length > 0 && (
                <div
                  role="radiogroup"
                  aria-label="Shipping address"
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {saved.map((a) => (
                    <AddressCard
                      key={a.id}
                      selected={choice === a.id}
                      onSelect={() => setPicked(a.id)}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        {a.full_name}
                        {a.is_default && <DefaultTag />}
                      </span>
                      <span>
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ""}
                      </span>
                      <span>
                        {a.city}
                        {a.region ? `, ${a.region}` : ""} {a.postal_code}
                      </span>
                      <span>{countryName(a.country)}</span>
                    </AddressCard>
                  ))}
                  <AddressCard
                    selected={choice === NEW}
                    onSelect={() => setPicked(NEW)}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <PlusIcon className="size-4" /> A new address
                    </span>
                  </AddressCard>
                </div>
              )}

              {choice === NEW && (
                <div className="animate-rise space-y-6">
                  <AddressForm
                    values={address}
                    errors={errors}
                    onChange={change}
                  />
                  {guest ? null : bookFull ? (
                    // The API wouldn't save it, so don't offer to.
                    <p className="text-[0.8125rem] text-muted-foreground">
                      You have {MAX_ADDRESSES} saved addresses, the most we
                      keep. To save this one, remove one in{" "}
                      <Link
                        href="/account/addresses"
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        your addresses
                      </Link>
                      .
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={save}
                          onChange={(e) => setSave(e.target.checked)}
                          className="size-4 accent-[var(--primary)]"
                        />
                        Save this address for next time
                      </label>
                      {save && (
                        <label className="animate-rise flex items-center gap-3 pl-7 text-sm">
                          <input
                            type="checkbox"
                            checked={makeDefault}
                            onChange={(e) => setMakeDefault(e.target.checked)}
                            className="size-4 accent-[var(--primary)]"
                          />
                          Make it my default address
                        </label>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Section>

        <Section number={3} title="Delivery">
          <div className="flex items-center gap-4 rounded-panel border border-border p-4 text-sm">
            <TruckIcon
              weight="light"
              className="size-6 text-muted-foreground"
            />
            <div className="flex-1">
              <p>Standard delivery</p>
              <p className="text-xs text-muted-foreground">2–4 working days</p>
            </div>
            <p className="tabular-nums">
              {cart.shipping === 0 ? "Free" : formatPrice(cart.shipping)}
            </p>
          </div>
        </Section>
      </div>

      <aside
        aria-label="Order summary"
        className="space-y-6 rounded-panel border border-border bg-surface/60 p-6 lg:sticky lg:top-24"
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="eyebrow">Order summary</p>
          <Link
            href="/cart"
            className="link-underline text-xs text-muted-foreground hover:text-foreground"
          >
            Edit bag
          </Link>
        </div>
        <ul className="max-h-80 space-y-4 overflow-y-auto pr-1">
          {cart.items.map((line) => (
            <li key={line.variant_id} className="flex gap-4">
              <div className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-media bg-background">
                {line.image && (
                  <Image
                    src={line.image}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                )}
                <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary font-mono text-[0.625rem] text-primary-foreground">
                  {line.quantity}
                </span>
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate">{line.product_name}</p>
                {line.options.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {optionSummary(line)}
                  </p>
                )}
              </div>
              <p className="text-sm tabular-nums">
                {formatPrice(line.line_total)}
              </p>
            </li>
          ))}
        </ul>
        <CartTotals cart={cart} />
        {credit > 0 && (
          <label className="flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
            <span className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={useCredit}
                onChange={(e) => setUseCredit(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Use store credit
            </span>
            <span className="text-success tabular-nums">
              {formatDiscount(credit)}
            </span>
          </label>
        )}
        {dropped && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-control border border-clay/40 px-3 py-2 text-xs text-clay"
          >
            <WarningCircleIcon
              className="mt-px size-3.5 shrink-0"
              weight="bold"
            />
            {dropped}
          </p>
        )}
        {cart.coupon?.issue && (
          <p className="text-xs text-clay" role="status">
            {couponRefusalMessage(cart.coupon.code, cart.coupon.issue.message)}{" "}
            <Link href="/cart" className="link-underline text-foreground">
              Go to your bag
            </Link>
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          <LockSimpleIcon />
          {redirecting
            ? "Opening secure payment…"
            : checkout.isPending
              ? "Reserving your items…"
              : `Pay ${formatPrice(cart.total - creditUsed)}`}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          You&apos;ll pay on Stripe&apos;s secure page. Items are held for you
          for 30 minutes.
        </p>
        <p className="text-center text-xs text-muted-foreground">
          By paying you agree to our{" "}
          <Link href="/terms" className="link-underline text-foreground">
            terms &amp; conditions
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="link-underline text-foreground">
            privacy policy
          </Link>
          . Custom prints can&apos;t be returned.
        </p>
      </aside>
    </form>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="animate-rise space-y-5"
      style={{ "--i": number } as React.CSSProperties}
    >
      <h2 className="flex items-baseline gap-3 font-serif text-3xl">
        <span className="font-mono text-xs text-muted-foreground">
          0{number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function AddressCard({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex min-h-28 flex-col items-start gap-0.5 border p-4 text-left text-[0.8125rem] transition-colors",
        selected
          ? "border-foreground bg-background"
          : "border-border text-muted-foreground hover:border-foreground/40",
      )}
    >
      {selected && (
        <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon weight="bold" className="size-3" />
        </span>
      )}
      {children}
    </button>
  );
}
