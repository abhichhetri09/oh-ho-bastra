import type { PublicUser } from "@repo/types";
import { startGuestSession } from "@/lib/api/client";

// A shopper without an account gets a guest session (a hidden account the
// API keeps their bag and orders under) on their first add to the bag.
// Signing in or registering later hands the bag and orders to the account.

let pending: Promise<PublicUser> | null = null;

/**
 * Starts a guest session, or resolves to the session's user if the browser
 * already has one. Calls made while one is in flight share it, so two quick
 * adds make one guest. Client only.
 */
export function ensureGuestSession(
  start: () => Promise<PublicUser> = startGuest,
): Promise<PublicUser> {
  pending ??= start().finally(() => {
    pending = null;
  });
  return pending;
}

async function startGuest(): Promise<PublicUser> {
  const { data } = await startGuestSession({ throwOnError: true });
  return data.data;
}
