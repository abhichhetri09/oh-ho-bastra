import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { WithSummary } from "@/components/common/SummaryPanel";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Loading } from "@/components/feedback/QueryView";
import { Bag } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyBag } from "@/features/cart/components/EmptyBag";
import { useCartItems } from "@/features/cart/useCartItems";
import { useCheckoutOptions, useCreateOrder } from "@/features/checkout/api";
import { checkoutErrorMessage } from "@/features/checkout/checkout-error";
import { CheckoutSection } from "@/features/checkout/components/CheckoutSection";
import { CheckoutSummary } from "@/features/checkout/components/CheckoutSummary";
import { FieldGrid } from "@/features/checkout/components/FieldGrid";
import { PaymentPicker } from "@/features/checkout/components/PaymentPicker";
import { ShippingPicker } from "@/features/checkout/components/ShippingPicker";
import { addressFields, contactFields } from "@/features/checkout/fields";
import { shippingCost } from "@/features/checkout/types";
import { useCheckoutForm } from "@/features/checkout/useCheckoutForm";
import { useSessionUser } from "@/features/auth/useSessionUser";
import { signInPath } from "@/lib/redirect";

export function Checkout() {
  const navigate = useNavigate();
  const { lines, items, subtotalCents, isPending: cartPending } = useCartItems();
  const { data: options, isPending: optionsPending, isError } = useCheckoutOptions();
  const form = useCheckoutForm(options);
  const createOrder = useCreateOrder();
  const { user, isPending: sessionPending } = useSessionUser();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createOrder.mutate(
      { ...form.values, items: lines },
      { onSuccess: ({ paymentUrl }) => void navigate(paymentUrl) },
    );
  }

  const body = () => {
    if (cartPending || optionsPending) return <Loading />;
    if (isError || !options) {
      return (
        <EmptyState
          icon={Bag}
          title="Checkout is not available"
          description="The shop is not answering right now. Try again in a moment."
        />
      );
    }
    if (items.length === 0) return <EmptyBag description="Add a tee before you check out." />;

    const shipping = options.shippingOptions.find((o) => o.id === form.values.shippingMethod);
    const freeFrom = options.freeShippingThresholdCents;
    return (
      <form onSubmit={onSubmit}>
        <WithSummary>
          <div className="space-y-10">
            {!user && !sessionPending ? (
              <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Have an account?{" "}
                <Link to={signInPath("/checkout")} className="font-medium text-foreground underline">
                  Sign in
                </Link>{" "}
                to fill in your saved address and track this order later.
              </p>
            ) : null}
            <CheckoutSection title="Contact">
              <FieldGrid fields={contactFields} bind={form.bind} />
            </CheckoutSection>
            <CheckoutSection title="Address">
              <FieldGrid fields={addressFields} bind={form.bind} />
            </CheckoutSection>
            <CheckoutSection title="Shipping">
              <ShippingPicker
                subtotalCents={subtotalCents}
                freeFrom={freeFrom}
                options={options.shippingOptions}
                value={form.values.shippingMethod}
                onChange={(id) => form.set("shippingMethod", id)}
              />
            </CheckoutSection>
            <CheckoutSection title="Payment">
              <PaymentPicker
                methods={options.paymentMethods}
                value={form.values.paymentMethod}
                onChange={(id) => form.set("paymentMethod", id)}
              />
            </CheckoutSection>
          </div>
          <CheckoutSummary
            items={items}
            subtotalCents={subtotalCents}
            shippingCents={shipping ? shippingCost(shipping, subtotalCents, freeFrom) : undefined}
            vatRate={options.vatRate}
            error={checkoutErrorMessage(createOrder.error, items)}
            submitting={createOrder.isPending}
          />
        </WithSummary>
      </form>
    );
  };

  return (
    <PageShell>
      <section className="space-y-10">
        <PageHeader
          kicker="Checkout"
          title="Delivery and payment"
          description="Shipping within Finland. Prices include VAT."
        />
        {body()}
      </section>
    </PageShell>
  );
}
