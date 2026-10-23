import type { ReactNode } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { Search } from "@/components/icons";
import { NotFoundError } from "@/lib/http";

type QueryLike<T> = { data: T | undefined; isPending: boolean; error: Error | null };

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="p-4 text-sm text-muted-foreground" role="status">
      {label}
    </p>
  );
}

/**
 * Renders loading, not-found and error states for a query, then `children(data)`.
 * Pass `notFound` / `error` to replace the default empty states.
 */
export function QueryView<T>({
  query,
  notFound,
  error,
  children,
}: {
  query: QueryLike<T>;
  notFound?: ReactNode;
  error?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return <Loading />;
  }
  if (query.error && !(query.error instanceof NotFoundError)) {
    return (
      error ?? (
        <EmptyState
          icon={Search}
          title="Could not load this"
          description="The shop is not answering right now. Try again in a moment."
        />
      )
    );
  }
  if (query.data === undefined) {
    return notFound ?? <EmptyState icon={Search} title="Not found" description="Check the link." />;
  }
  return <>{children(query.data)}</>;
}
