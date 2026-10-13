"use client";

import { ErrorState } from "@/components/feedback/error-state";

// Inside the admin shell, so the sidebar stays usable.
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorState
      error={error}
      retry={unstable_retry}
      home={{ href: "/admin", label: "Back to dashboard" }}
    />
  );
}
