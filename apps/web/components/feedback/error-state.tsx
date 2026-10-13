"use client";

import { useEffect } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What every error boundary shows. `retry` is the boundary's
 * unstable_retry: it re-fetches the failed segment from the server, where
 * reset() would only re-render the same failed result on the client.
 */
export function ErrorState({
  error,
  retry,
  home = { href: "/", label: "Home" },
  className,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  home?: { href: string; label: string };
  className?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      className={cn("flex-1", className)}
      eyebrow="Something went wrong"
      title="We dropped a stitch."
      action={
        <>
          <Button onClick={retry}>Try again</Button>
          <Link
            href={home.href}
            className={buttonVariants({ variant: "outline" })}
          >
            {home.label}
          </Link>
        </>
      }
    >
      <p>
        The store couldn&apos;t load this page. It&apos;s usually temporary, so
        please try again.
      </p>
      {/* Server errors reach the browser as this id only; it matches the
          server log line, so it's worth quoting in a support message. */}
      {error.digest && (
        <p className="mt-4 font-mono text-[0.6875rem] tracking-[0.08em]">
          Reference: {error.digest}
        </p>
      )}
    </EmptyState>
  );
}
