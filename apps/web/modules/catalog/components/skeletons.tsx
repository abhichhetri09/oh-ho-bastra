import { cn } from "@/lib/utils";
import { GRID_CLASSES } from "./product-grid";

function Block({ className }: { className?: string }) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-media bg-muted", className)}
      aria-hidden
    />
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className={GRID_CLASSES}
      aria-busy="true"
      aria-label="Loading products"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3.5">
          <Block className="aspect-[4/5] w-full" />
          <div className="flex justify-between gap-4">
            <Block className="h-3.5 w-2/3" />
            <Block className="h-3.5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListingSkeleton() {
  return (
    <div>
      <div className="flex h-12 items-center justify-between border-b border-border">
        <Block className="h-3.5 w-24" />
        <Block className="h-3.5 w-32" />
      </div>
      <div className="grid gap-10 pt-6 lg:grid-cols-[15rem_1fr] lg:gap-12">
        <div className="hidden space-y-6 lg:block">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-3 border-b border-border pb-6">
              <Block className="h-3 w-16" />
              <Block className="h-8 w-full" />
            </div>
          ))}
        </div>
        <ProductGridSkeleton />
      </div>
    </div>
  );
}

export function CollectionHeaderSkeleton() {
  return (
    <div className="space-y-5 pt-10 pb-10 sm:pt-16">
      <Block className="h-3 w-40" />
      <Block className="h-16 w-2/3 max-w-xl sm:h-24" />
      <Block className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function ProductPageSkeleton() {
  return (
    <div className="grid gap-8 pt-6 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
      <div className="grid gap-3 sm:grid-cols-[4.5rem_1fr]">
        <div className="hidden space-y-3 sm:block">
          {Array.from({ length: 3 }, (_, i) => (
            <Block key={i} className="aspect-[4/5] w-full" />
          ))}
        </div>
        <Block className="aspect-[4/5] w-full" />
      </div>
      <div className="space-y-6 lg:pt-10">
        <Block className="h-3 w-32" />
        <Block className="h-14 w-4/5" />
        <Block className="h-6 w-24" />
        <Block className="h-24 w-full" />
        <Block className="h-12 w-full" />
      </div>
    </div>
  );
}
