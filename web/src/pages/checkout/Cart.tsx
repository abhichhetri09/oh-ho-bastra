import { Link } from "react-router-dom";

import { SummaryPanel, WithSummary } from "@/components/common/SummaryPanel";
import { Loading } from "@/components/feedback/QueryView";
import { ArrowRight } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SummaryList } from "@/components/ui/summary-list";
import { useCart } from "@/features/cart/cart-context";
import { CartLineItem } from "@/features/cart/components/CartLineItem";
import { EmptyBag } from "@/features/cart/components/EmptyBag";
import { useCartItems } from "@/features/cart/useCartItems";
import { formatPrice, plural } from "@/lib/format";

export function Cart() {
  const { itemCount, clear } = useCart();
  const { items, subtotalCents, isPending } = useCartItems();

  return (
    <PageShell>
      <section className="space-y-10">
        <PageHeader
          kicker="Bag"
          title="Your bag"
          description={itemCount === 0 ? "Nothing in it yet." : `${plural(itemCount, "tee")}.`}
        />
        {isPending ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyBag />
        ) : (
          <WithSummary className="lg:grid-cols-[1fr_18rem]">
            <ul className="divide-y border-y">
              {items.map((item) => (
                <CartLineItem key={`${item.slug}-${item.size}`} item={item} />
              ))}
            </ul>
            <SummaryPanel>
              <SummaryList rows={[{ label: "Total", value: formatPrice(subtotalCents), total: true }]} />
              <div className="flex flex-col gap-2">
                <Button asChild>
                  <Link to="/checkout">
                    <ArrowRight />
                    Checkout
                  </Link>
                </Button>
                <ConfirmAction
                  trigger="Clear bag"
                  title="Empty your bag?"
                  description="All tees are removed. This can’t be undone."
                  confirmLabel="Clear bag"
                  tone="destructive"
                  onConfirm={clear}
                />
              </div>
            </SummaryPanel>
          </WithSummary>
        )}
      </section>
    </PageShell>
  );
}
