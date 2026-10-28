import {
  deleteGuestUser,
  reassignGuestOrders,
  revokeAllUserSessions,
  type User,
} from "../db/gen";
import { withTx, type Pool } from "../db/pool";
import { mergeCarts } from "../shopping/cart";

// Guests: a shopper who adds to the bag without an account gets a hidden
// user (role 'guest', no email or password) and a session, so the cart,
// checkout and orders work as they do for customers. Each checkout gives
// an email, kept on the order. Signing in or registering from a guest
// session hands what the guest had to the account (adoptGuest), and a
// background job deletes guests nobody can use any more.

/** How long a guest that never ordered is kept once it can't sign in. */
export const GUEST_TTL_MS = 30 * 24 * 60 * 60_000;

/** What adoptGuest moved. */
export interface Adoption {
  /** The guest's orders that went to the account. */
  orders: number;
  /** Whether the guest is gone (false while it still has orders). */
  deleted: boolean;
}

/**
 * Hands a guest's bag and orders to the account it signed in to, in one
 * transaction: the carts merge (see mergeCarts), the guest's orders placed
 * with the account's email move to the account, the guest's sessions end,
 * and the guest is deleted unless orders with other emails remain on it
 * (they're still found by number and email).
 */
export function adoptGuest(
  db: Pool,
  guest: User,
  account: User,
): Promise<Adoption> {
  return withTx(db, async (tx) => {
    await mergeCarts(tx, guest.id, account.id);
    const orders =
      account.email === null
        ? 0
        : await reassignGuestOrders(tx, {
            account_id: account.id,
            guest_id: guest.id,
            email: account.email,
          });
    await revokeAllUserSessions(tx, guest.id);
    const deleted = (await deleteGuestUser(tx, guest.id)) > 0;
    return { orders, deleted };
  });
}
