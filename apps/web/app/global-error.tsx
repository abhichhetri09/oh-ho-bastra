"use client";

import "./globals.css";
import { ErrorState } from "@/components/feedback/error-state";
import { MinimalHeader } from "@/components/layout/minimal-header";
import { fontVariables } from "@/lib/fonts";
import { site } from "@/lib/site";
import { DEFAULT_THEME } from "@/lib/themes";
import { cn } from "@/lib/utils";

// Replaces the root layout when the layout itself throws (the session or
// theme lookup), so it brings its own <html>, styles and fonts. No
// Providers: they may be what failed. The store theme is unknown here, so
// it uses the default.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      className={cn("h-full antialiased", fontVariables)}
    >
      <body className="flex min-h-full flex-col">
        <title>{`Something went wrong | ${site.name}`}</title>
        <main className="flex min-h-svh flex-col">
          <MinimalHeader className="container-page" />
          <ErrorState error={error} retry={unstable_retry} />
        </main>
      </body>
    </html>
  );
}
