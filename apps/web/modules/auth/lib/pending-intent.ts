import type { LinePreview } from "@/modules/cart/lib/cart-math";

/**
 * What a signed-out shopper tapped before being sent to sign in, replayed
 * when they come back to the same page signed in, so the item lands in the
 * bag (or the wishlist) without a second tap.
 */
export type PendingIntent =
  | { kind: "bag"; path: string; preview: LinePreview; at: number }
  | { kind: "save"; path: string; productId: string; name: string; at: number };

const KEY = "cs-pending-intent";
/** An intent older than this was abandoned. */
const MAX_AGE_MS = 30 * 60 * 1000;

/** Remembers intent for this tab (sessionStorage; best effort). */
export function rememberIntent(intent: PendingIntent): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // Storage off (private mode): the shopper taps again, as before.
  }
}

/**
 * The remembered intent for path, removed so it runs once. One for another
 * page stays until it expires; an expired or unreadable one is dropped.
 */
export function takeIntent(
  path: string,
  now = Date.now(),
): PendingIntent | null {
  let intent: PendingIntent | null = null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    intent = JSON.parse(raw) as PendingIntent;
    if (now - intent.at > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    if (intent.path !== path) return null;
    sessionStorage.removeItem(KEY);
    return intent;
  } catch {
    return null;
  }
}
