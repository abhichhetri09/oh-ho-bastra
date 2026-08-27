import { ProductCard } from "@/components/ProductCard";
import { products } from "@/data/products";

export function Home() {
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">
          Shop
        </p>
        <h1 className="text-4xl font-medium tracking-tight md:text-5xl">
          Cloth with a quiet cut
        </h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  );
}
