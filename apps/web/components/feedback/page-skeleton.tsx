import { Skeleton } from "@/components/ui/skeleton";

/**
 * A neutral loading state for account, bag and checkout pages: a heading
 * and a two-column body, instead of the shop's product grid.
 */
export function PageSkeleton() {
  return (
    <div className="container-page pt-8 pb-24 sm:pt-14" aria-busy>
      <Skeleton className="mb-10 h-16 w-64" />
      <div className="grid gap-12 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
