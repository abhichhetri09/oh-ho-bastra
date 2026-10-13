import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getSessionUser } from "@/lib/auth/session";
import { PendingIntentRunner } from "@/modules/auth/components/pending-intent";
import { getServerCart } from "@/modules/cart/api";
import { cartKeys } from "@/modules/cart/keys";

export default async function ShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Seed the signed-in user's cart above the header, so the bag count and
  // /cart render on the server. Layouts persist across client navigation,
  // so this runs on full page loads only; the cache takes over after.
  const user = await getSessionUser();
  const cart = user ? await getServerCart() : null;
  const queryClient = new QueryClient();
  if (user && cart) queryClient.setQueryData(cartKeys.mine(user.id), cart);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <a
        href="#content"
        className="sr-only z-50 bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AnnouncementBar />
      <SiteHeader />
      <main id="content" className="flex w-full flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
      <PendingIntentRunner />
    </HydrationBoundary>
  );
}
