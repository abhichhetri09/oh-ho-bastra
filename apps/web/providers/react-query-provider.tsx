"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { shouldRetry } from "@/lib/api/errors";

export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Server components render the data; don't refetch it straight
          // away. A 4xx won't change on a retry, so it shows at once.
          queries: { staleTime: 60_000, retry: shouldRetry },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {/* A no-op in production builds. */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
