import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";

import { CartProvider } from "@/features/cart/CartProvider";
import { FlyToBagProvider } from "@/features/cart/FlyToBag";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CartProvider>
          <FlyToBagProvider>{children}</FlyToBagProvider>
        </CartProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
