import { Link } from "react-router-dom";

import { ClothPanel } from "@/components/ClothPanel";
import { ArrowRight, Pen, Shirt } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { ProductGrid } from "@/components/ProductGrid";
import { Button } from "@/components/ui/button";
import { collections } from "@/data/collections";
import { products } from "@/data/products";

export function Home() {
  const hero = products[0];
  const custom = products.find((product) => product.collection === "custom");

  return (
    <div>
      <section className="grid min-h-[calc(100svh-4.5rem)] lg:grid-cols-2">
        <div className="flex flex-col justify-center px-6 py-16 lg:px-16 lg:py-24">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Oh Ho Bastra
          </p>
          <h1 className="mt-4 max-w-xl font-serif text-5xl font-medium leading-[1.05] tracking-tight md:text-7xl">
            Tees. And the ones we <em className="font-normal italic">print for you</em>.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            Heavyweight cotton, a few colors. Custom prints and text when you
            want something that isn’t on the rack.
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
        <ClothPanel
          swatch={hero.swatch}
          label={hero.name}
          className="min-h-[48vh] lg:min-h-full"
        />
      </section>

      <section
        id="collections"
        className="scroll-mt-20 border-t px-6 py-16 lg:px-16 lg:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <PageHeader
            kicker="Shop"
            title="Two ways"
            description="Plain tees off the shelf, or we print yours."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {collections.map((collection) => (
              <Link
                key={collection.slug}
                to={`/collections/${collection.slug}`}
                className="group block"
              >
                <div className="overflow-hidden">
                  <ClothPanel
                    swatch={collection.swatch}
                    className="aspect-4/5 transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                </div>
                <p className="mt-4 flex items-center gap-2 font-serif text-2xl font-medium tracking-tight">
                  {collection.name}
                  <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {collection.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section
        id="shop"
        className="scroll-mt-20 border-t px-6 py-16 lg:px-16 lg:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <PageHeader
            kicker="The shop"
            title="In stock"
            description="Four plain tees. Two custom. That’s the shop."
          />
          <div className="mt-12">
            <ProductGrid products={products} />
          </div>
        </div>
      </section>

      <section className="border-t px-6 py-20 lg:px-16 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
          <ClothPanel
            swatch={custom?.swatch ?? products[0].swatch}
            className="aspect-5/4"
            label="Custom tee"
          />
          <div className="max-w-md">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Custom
            </p>
            <h2 className="mt-4 font-serif text-4xl font-medium tracking-tight md:text-5xl">
              Your art, or a line of type.
            </h2>
            <p className="mt-5 leading-relaxed text-muted-foreground">
              Same cotton tees. We print after you order — a file, a name, a
              short mark. Write us if you need a run for a group.
            </p>
            <Button className="mt-8" variant="outline" asChild>
              <Link to="/collections/custom">
                See custom tees
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
