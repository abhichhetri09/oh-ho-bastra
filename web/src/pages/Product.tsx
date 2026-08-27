import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Breadcrumb } from "@/components/Breadcrumb";
import { ClothPanel } from "@/components/ClothPanel";
import { EmptyState } from "@/components/EmptyState";
import { Bag, Check, Droplets, Minus, Plus, Ruler, Search, Shirt, Weight } from "@/components/icons";
import { PageShell } from "@/components/PageShell";
import { ProductGrid } from "@/components/ProductGrid";
import { Button } from "@/components/ui/button";
import { getCollection } from "@/data/collections";
import { getProduct, getRelatedProducts } from "@/data/products";
import { useCart } from "@/lib/cart";
import { useFlyToBag } from "@/lib/fly-to-bag";
import { cn } from "@/lib/utils";

export function Product() {
  const { slug } = useParams();
  const product = slug ? getProduct(slug) : undefined;
  const collection = product ? getCollection(product.collection) : undefined;
  const related = slug ? getRelatedProducts(slug) : [];
  const { add } = useCart();
  const { fly } = useFlyToBag();
  const visualRef = useRef<HTMLDivElement>(null);
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState(product?.sizes[1] ?? "M");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setQuantity(1);
    setAdded(false);
    setSize(product?.sizes[1] ?? "M");
  }, [slug, product?.sizes]);

  if (!product) {
    return (
      <PageShell>
        <EmptyState
          icon={Search}
          title="Not found"
          description="That tee is not in the shop."
          action={
            <Button variant="outline" asChild>
              <Link to="/">Back to shop</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  function onAdd() {
    const origin = visualRef.current?.getBoundingClientRect();
    if (origin) {
      fly(origin, product.swatch);
    }
    add(product.slug, quantity, size);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <PageShell className="max-w-7xl">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div
          ref={visualRef}
          className="aspect-3/4 lg:sticky lg:top-24 lg:aspect-auto lg:min-h-144"
        >
          <ClothPanel
            swatch={product.swatch}
            label={product.name}
            className="h-full min-h-full lg:min-h-144"
          />
        </div>
        <div className="flex flex-col">
          <Breadcrumb
            items={[
              { label: "Shop", to: "/#shop" },
              collection
                ? {
                    label: collection.name,
                    to: `/collections/${collection.slug}`,
                  }
                : { label: "Shop" },
              { label: product.name },
            ]}
          />
          <p className="mt-8 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {collection?.name ?? "Tee"}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight md:text-5xl">
            {product.name}
          </h1>
          <p className="mt-3 text-lg tabular-nums">{product.price}</p>
          <p className="mt-6 max-w-md leading-relaxed text-muted-foreground">
            {product.description}
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-2 gap-x-8 gap-y-5 border-y py-8 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <Shirt className="size-3.5" strokeWidth={1.5} aria-hidden />
                Cloth
              </dt>
              <dd className="mt-1">{product.fabric}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <Ruler className="size-3.5" strokeWidth={1.5} aria-hidden />
                Fit
              </dt>
              <dd className="mt-1">{product.fit}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <Weight className="size-3.5" strokeWidth={1.5} aria-hidden />
                Weight
              </dt>
              <dd className="mt-1">{product.weight}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <Droplets className="size-3.5" strokeWidth={1.5} aria-hidden />
                Care
              </dt>
              <dd className="mt-1">{product.care}</dd>
            </div>
          </dl>
          <div className="mt-8 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Size
            </p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSize(option)}
                  className={cn(
                    "h-10 min-w-10 border px-3 text-sm",
                    size === option
                      ? "border-foreground bg-foreground text-background"
                      : "border-input hover:border-foreground",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="flex items-center border">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-none"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                aria-label="Decrease quantity"
              >
                <Minus />
              </Button>
              <span className="w-10 text-center text-sm tabular-nums">
                {quantity}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-none"
                onClick={() => setQuantity((value) => value + 1)}
                aria-label="Increase quantity"
              >
                <Plus />
              </Button>
            </div>
            <Button size="lg" onClick={onAdd}>
              {added ? <Check /> : <Bag />}
              {added ? "Added to bag" : "Add to bag"}
            </Button>
          </div>
        </div>
      </div>
      {related.length > 0 ? (
        <section className="mt-24 border-t pt-16">
          <h2 className="font-serif text-3xl font-medium tracking-tight">
            More tees
          </h2>
          <div className="mt-10">
            <ProductGrid products={related} />
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
