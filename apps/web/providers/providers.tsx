"use client";

import type { PublicUser, ShippingRule } from "@repo/types";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "./auth-provider";
import { ReactQueryProvider } from "./react-query-provider";
import { ShippingProvider } from "./shipping-provider";

export function Providers({
  user,
  shipping,
  children,
}: {
  user: PublicUser | null;
  shipping: ShippingRule;
  children: React.ReactNode;
}) {
  return (
    <ReactQueryProvider>
      <AuthProvider user={user}>
        <ShippingProvider rule={shipping}>
          <MotionProvider>{children}</MotionProvider>
        </ShippingProvider>
        {/* Bottom right on larger screens; on phones sonner spans the
            width at the bottom, kept clear of the iPhone home bar. */}
        <Toaster
          position="bottom-right"
          mobileOffset={{
            // --toast-lift: the product page's buy bar, while it shows.
            bottom:
              "calc(env(safe-area-inset-bottom) + 16px + var(--toast-lift, 0px))",
            left: 16,
            right: 16,
          }}
        />
      </AuthProvider>
    </ReactQueryProvider>
  );
}
