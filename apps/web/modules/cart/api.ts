import "server-only";
import { cache } from "react";
import type { Cart } from "@repo/types";
import { getCart } from "@repo/api-client/server";
import { serverClient } from "@/lib/api/server";

/**
 * The signed-in user's cart for server rendering, or null when it can't be
 * read here (an expired access token gets a 401; the browser then fetches
 * it through the refreshing client). Never stored in the data cache (it
 * is per user); cache() only shares one fetch within a request.
 */
export const getServerCart = cache(async (): Promise<Cart | null> => {
  try {
    const { data } = await getCart({
      client: await serverClient(),
      cache: "no-store",
    });
    return data?.data ?? null;
  } catch {
    return null;
  }
});
