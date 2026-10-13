"use client";

import { ErrorState } from "@/components/feedback/error-state";
import { MinimalHeader } from "@/components/layout/minimal-header";

// Errors outside the shop and admin layouts (auth pages, the account
// guard). Like the root 404, it brings its own minimal header.
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="flex min-h-svh flex-col">
      <MinimalHeader className="container-page" />
      <ErrorState error={error} retry={unstable_retry} />
    </main>
  );
}
