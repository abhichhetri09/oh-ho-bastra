"use server";

import { cookies } from "next/headers";
import { updateTag } from "next/cache";
import { CATALOG_TAG, SETTINGS_TAG } from "@/lib/api/public";
import { fetchCurrentUser } from "@/lib/auth/session";
import { THEME_COOKIE } from "@/lib/themes";

/**
 * Drops the storefront's cached catalog (categories, listings, product
 * pages) after an admin edit, so the change shows at once instead of
 * after the cache's minute. updateTag (not revalidateTag) expires the
 * entries outright, so the next visit reads fresh data rather than one
 * stale copy. Admins only; anyone else is a no-op. The role comes from the
 * API (GET /auth/me), not the cookie's unverified claims: a forged token
 * must not be able to flush the cache over and over.
 */
export async function revalidateCatalog(): Promise<void> {
  const user = await fetchCurrentUser().catch(() => null);
  if (user?.role !== "admin") return;
  updateTag(CATALOG_TAG);
}

/**
 * After an admin saves the store's theme: expires the cached setting, so
 * every page renders the new theme next, and clears this browser's demo
 * picker choice, which would otherwise keep overriding it here. Admins
 * only, checked against the API like revalidateCatalog.
 */
export async function revalidateStoreSettings(): Promise<void> {
  const user = await fetchCurrentUser().catch(() => null);
  if (user?.role !== "admin") return;
  updateTag(SETTINGS_TAG);
  (await cookies()).delete(THEME_COOKIE);
}
