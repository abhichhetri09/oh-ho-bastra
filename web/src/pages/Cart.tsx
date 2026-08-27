import { Link } from "react-router-dom";

import { ClothPanel } from "@/components/ClothPanel";
import { EmptyState } from "@/components/EmptyState";
import { ArrowRight, Bag, Minus, Plus, Shirt, Trash } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { formatRupees, getProduct } from "@/data/products";
import { useCart } from "@/lib/cart";

export function Cart() {
  const { lines, itemCount, setQuantity, remove, clear } = useCart();

  const detailed = lines.flatMap((line) => {
    const product = getProduct(line.slug);
    return product ? [{ ...line, product }] : [];
  });

  const total = detailed.reduce(
    (sum, line) => sum + line.product.amount * line.quantity,
    0,
  );

  return (
    <PageShell>
      <section className="space-y-10">
        <PageHeader
          kicker="Bag"
          title="Your bag"
          description={
            itemCount === 0
              ? "Nothing in it yet."
              : `${itemCount} tee${itemCount === 1 ? "" : "s"}.`
          }
        />
        {detailed.length === 0 ? (
          <EmptyState
            icon={Bag}
            title="The bag is empty"
            description="Add a tee when you’re ready."
            action={
              <Button asChild>
                <Link to="/#shop">
                  <Shirt />
                  Shop tees
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-12 lg:grid-cols-[1fr_18rem]">
            <ul className="divide-y border-y">
              {detailed.map((line) => (
                <li
                  key={`${line.slug}-${line.size}`}
                  className="flex items-start gap-4 py-6 sm:gap-6"
                >
                  <Link
                    to={`/products/${line.product.slug}`}
                    className="shrink-0"
                  >
                    <ClothPanel
                      swatch={line.product.swatch}
                      className="h-24 w-20 sm:h-28 sm:w-24"
                      label={line.product.name}
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/products/${line.product.slug}`}
                      className="font-serif text-xl font-medium tracking-tight hover:underline"
                    >
                      {line.product.name}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Size {line.size} · {line.product.price}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <div className="flex items-center border">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-none"
                          onClick={() =>
                            setQuantity(line.slug, line.size, line.quantity - 1)
                          }
                          aria-label="Decrease quantity"
                        >
                          <Minus />
                        </Button>
                        <span className="w-8 text-center text-sm tabular-nums">
                          {line.quantity}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-none"
                          onClick={() =>
                            setQuantity(line.slug, line.size, line.quantity + 1)
                          }
                          aria-label="Increase quantity"
                        >
                          <Plus />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => remove(line.slug, line.size)}
                      >
                        <Trash />
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <aside className="h-fit space-y-6 border p-6 lg:sticky lg:top-24">
              <div className="flex items-baseline justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Total
                </p>
                <p className="font-serif text-2xl tabular-nums">
                  {formatRupees(total)}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button>
                  <ArrowRight />
                  Checkout
                </Button>
                <Button variant="outline" onClick={clear}>
                  Clear bag
                </Button>
              </div>
            </aside>
          </div>
        )}
      </section>
    </PageShell>
  );
}
