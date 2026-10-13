import { Skeleton } from "@/components/ui/skeleton";

// Inside the account layout (its nav stays): just the page body.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy>
      <Skeleton className="h-14 w-56" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}
