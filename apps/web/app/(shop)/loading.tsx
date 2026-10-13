import { ProductGridSkeleton } from "@/modules/catalog/components/skeletons";

export default function Loading() {
  return (
    <div className="container-page space-y-10 py-14" aria-busy>
      <div className="skeleton-shimmer h-20 w-2/3 max-w-xl bg-muted" />
      <ProductGridSkeleton />
    </div>
  );
}
