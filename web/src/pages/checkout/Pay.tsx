import { Link, useNavigate, useParams } from "react-router-dom";

import { BackToShop } from "@/components/common/BackToShop";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryView } from "@/components/feedback/QueryView";
import { Info, Search } from "@/components/icons";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useCart } from "@/features/cart/cart-context";
import { useCheckoutLabels } from "@/features/checkout/api";
import { useCompleteMockPayment, usePayment } from "@/features/payments/api";
import { MockPaymentActions } from "@/features/payments/components/MockPaymentActions";
import { PaymentFacts } from "@/features/payments/components/PaymentFacts";
import { stepCopy } from "@/features/payments/step-copy";
import type { MockOutcome, Payment } from "@/features/payments/types";

// Stand-in for the provider's hosted payment page (Paytrail in production).
export function Pay() {
  const { paymentId } = useParams();

  return (
    <PageShell>
      <section className="mx-auto max-w-md space-y-6">
        <QueryView
          query={usePayment(paymentId)}
          notFound={
            <EmptyState
              icon={Search}
              title="Payment not found"
              description="This payment link is not valid, or it has expired."
              action={<BackToShop label="Back to bag" to="/cart" />}
            />
          }
        >
          {(payment) => <PaymentScreen payment={payment} />}
        </QueryView>
      </section>
    </PageShell>
  );
}

function PaymentScreen({ payment }: { payment: Payment }) {
  const navigate = useNavigate();
  const { clear } = useCart();
  const labels = useCheckoutLabels();
  const complete = useCompleteMockPayment(payment.id);
  const method = labels.paymentMethod(payment.method);
  const methodName = method?.name ?? payment.method;

  function finish(outcome: MockOutcome) {
    complete.mutate(outcome, {
      onSuccess: ({ orderId, status }) => {
        if (status === "paid") clear();
        void navigate(`/orders/${orderId}`, { replace: true });
      },
    });
  }

  return (
    <>
      <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <Info className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        Test payment page. Nothing is charged.
      </p>
      <div className="rounded-xl border p-8">
        <Eyebrow wide>Paytrail · test</Eyebrow>
        <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">Pay with {methodName}</h1>
        <PaymentFacts payment={payment} />

        {payment.status === "pending" ? (
          <div className="mt-8 space-y-8">
            {method ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {stepCopy[method.group](methodName)}
              </p>
            ) : null}
            {complete.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {complete.error.message}
              </p>
            ) : null}
            <MockPaymentActions onChoose={finish} disabled={complete.isPending} />
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <p className="text-sm text-muted-foreground">This payment is already {payment.status}.</p>
            <Button variant="outline" asChild>
              <Link to={`/orders/${payment.orderId}`}>View order</Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
