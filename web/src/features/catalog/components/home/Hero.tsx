import { Link } from "react-router-dom";

import { ProductImage } from "@/components/common/ProductImage";
import { Pen, Shirt } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { Product } from "@/features/catalog/types";

export function Hero({ product }: { product: Product | undefined }) {
  return (
    <section className="grid min-h-[calc(100svh-4.5rem)] lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-16 lg:px-16 lg:py-24">
        <Eyebrow wide>Oh Ho Bastra</Eyebrow>
        <h1 className="mt-4 max-w-xl font-serif text-5xl font-medium leading-[1.05] tracking-tight md:text-7xl">
          Tees. And the ones we <em className="font-normal italic">print for you</em>.
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
          Heavyweight cotton, a few colours. Custom prints and text when you want something that
          isn’t on the rack.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <a href="#shop">
              <Shirt />
              Shop tees
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/collections/custom">
              <Pen />
              Custom
            </Link>
          </Button>
        </div>
      </div>
      <ProductImage
        src={product?.images[0]?.url}
        alt={product?.images[0]?.alt || product?.name || "Oh Ho Bastra tee"}
        swatch={product?.swatch}
        eager
        className="min-h-[48vh] lg:min-h-full"
      />
    </section>
  );
}
