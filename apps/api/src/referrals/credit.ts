import {
  addCreditEntry,
  countEarnedSince,
  listCreditLedger,
  listDueReferrals,
  listUsersWithLapsedCredit,
  lockCreditUser,
  pendingOrderCredit,
  settleReferral,
  type AddCreditEntryParams,
  type CreditLedger,
  type Order,
} from "../db/gen";
import { withTx, type Pool } from "../db/pool";
import type { Queryable } from "../db/queryable";
import { log } from "../log";
import { loadReferralRule } from "./referrals";

// Store credit: an append-only ledger (credit_ledger) per customer. Credit
// added (a referral earned, an order's credit given back, an adjustment
// up) is a lot that may lapse; credit taken (spent online or at the
// counter, an adjustment down) comes out of the lots that lapse first.
// The balance is worked out from the ledger, never stored. Every change
// locks the customer first (lockCredit), so two can't spend the same
// credit. Amounts are cents.

/** The least Stripe charges (€0.50): credit never takes an order below it. */
export const MIN_CHARGE = 50;

/** How many referrals or customers one run of the credit job takes. */
const BATCH = 100;

/** Credit added, and what's left of it. */
export interface CreditLot {
  id: string;
  remaining: number;
  expires_at: Date | null;
  /** An expired row has taken what was left. */
  closed: boolean;
}

/** What creditLots needs of a ledger row. */
export type LedgerRow = Pick<
  CreditLedger,
  "id" | "amount" | "kind" | "lot_id" | "expires_at" | "created_at"
>;

const lapsed = (lot: Pick<CreditLot, "expires_at">, at: Date) =>
  lot.expires_at !== null && lot.expires_at.getTime() <= at.getTime();

/**
 * Replays a ledger (oldest first): the lots it added with what's left of
 * each, and the balance at now. Credit taken comes out of the lots that
 * lapse first (those that never lapse last), among those still live when
 * it was taken; anything taken beyond them (a counter redemption racing a
 * late payment) is owed and comes out of the next credit added. Lots that
 * lapsed by now don't count, expired by the job or not yet.
 */
export function creditLots(
  rows: LedgerRow[],
  now: Date,
): { balance: number; lots: CreditLot[] } {
  const lots: CreditLot[] = [];
  const byId = new Map<string, CreditLot>();
  let owed = 0;
  for (const row of rows) {
    if (row.kind === "expired") {
      const lot = row.lot_id === null ? undefined : byId.get(row.lot_id);
      if (lot) {
        lot.remaining += row.amount;
        lot.closed = true;
      }
      continue;
    }
    if (row.amount > 0) {
      const lot: CreditLot = {
        id: row.id,
        remaining: row.amount,
        expires_at: row.expires_at,
        closed: false,
      };
      const settle = Math.min(owed, lot.remaining);
      lot.remaining -= settle;
      owed -= settle;
      lots.push(lot);
      byId.set(row.id, lot);
      continue;
    }
    let need = -row.amount;
    const live = lots
      .filter((l) => !l.closed && l.remaining > 0 && !lapsed(l, row.created_at))
      .sort(
        (a, b) =>
          (a.expires_at?.getTime() ?? Infinity) -
          (b.expires_at?.getTime() ?? Infinity),
      );
    for (const lot of live) {
      const take = Math.min(need, lot.remaining);
      lot.remaining -= take;
      need -= take;
      if (need === 0) break;
    }
    owed += need;
  }
  const balance =
    lots
      .filter((l) => !l.closed && !lapsed(l, now))
      .reduce((sum, l) => sum + l.remaining, 0) - owed;
  return { balance, lots };
}

/** Locks the customer's credit for the rest of the transaction. */
export async function lockCredit(tx: Queryable, userId: string) {
  await lockCreditUser(tx, userId);
}

/** The customer's ledger and its balance at now. */
export async function loadCredit(db: Queryable, userId: string, now: Date) {
  const entries = await listCreditLedger(db, userId);
  return { entries, ...creditLots(entries, now) };
}

/**
 * The balance less what the customer's unpaid checkouts hold (spent once
 * they're paid, given back if they're cancelled).
 */
export async function availableCredit(
  db: Queryable,
  userId: string,
  now: Date,
): Promise<{ balance: number; available: number }> {
  const { balance } = await loadCredit(db, userId, now);
  const held = (await pendingOrderCredit(db, userId))?.credit ?? 0;
  return { balance, available: Math.max(balance - held, 0) };
}

/**
 * The most credit can pay of a bill: maxPercent of it (rounded down), and
 * never so much that less than MIN_CHARGE is left to pay by card.
 */
export const creditCap = (bill: number, maxPercent: number) =>
  Math.max(
    Math.min(Math.floor((bill * maxPercent) / 100), bill - MIN_CHARGE),
    0,
  );

/** months from now, or null for credit that never lapses. */
export function expiryFrom(now: Date, months: number | null): Date | null {
  if (months === null) return null;
  const at = new Date(now);
  at.setUTCMonth(at.getUTCMonth() + months);
  return at;
}

/** Writes a ledger row (defaults for what it doesn't say). */
export async function addEntry(
  tx: Queryable,
  entry: Pick<AddCreditEntryParams, "user_id" | "amount" | "kind"> &
    Partial<AddCreditEntryParams>,
): Promise<CreditLedger> {
  const row = await addCreditEntry(tx, {
    order_id: null,
    referral_id: null,
    lot_id: null,
    expires_at: null,
    note: "",
    created_by: null,
    refund_id: null,
    ...entry,
  });
  if (!row) throw new Error("add credit entry: no rows in result set");
  return row;
}

/** A paid order's credit, taken from the customer (in fulfil's transaction). */
export async function spendOrderCredit(
  tx: Queryable,
  order: Pick<Order, "id" | "user_id" | "credit" | "number">,
  now: Date,
): Promise<void> {
  if (order.credit <= 0) return;
  await lockCredit(tx, order.user_id);
  const { balance } = await loadCredit(tx, order.user_id, now);
  if (balance < order.credit) {
    // Spent elsewhere between checkout and payment: the order got it, so
    // the customer owes it out of their next credit.
    log.warn("credit: order paid with more credit than is left", {
      order: order.number,
      balance,
      credit: order.credit,
    });
  }
  await addEntry(tx, {
    user_id: order.user_id,
    amount: -order.credit,
    kind: "spent",
    order_id: order.id,
  });
}

/**
 * The store credit part of a refund, given back (lapsing as credit earned
 * now would). Nothing when the refund took none.
 */
export async function reverseRefundCredit(
  tx: Queryable,
  order: Pick<Order, "id" | "user_id">,
  refundId: string,
  amount: number,
  now: Date,
): Promise<void> {
  if (amount <= 0) return;
  const rule = await loadReferralRule(tx);
  await lockCredit(tx, order.user_id);
  await addEntry(tx, {
    user_id: order.user_id,
    amount,
    kind: "reversed",
    order_id: order.id,
    refund_id: refundId,
    expires_at: expiryFrom(now, rule.credit_expiry_months),
  });
}

/**
 * Takes back the credit a refund gave when the refund failed at Stripe
 * (the card part never went back, so the refund as a whole is undone).
 * Taken as an adjustment: if it was spent since, the customer owes it out
 * of their next credit.
 */
export async function takeBackRefundCredit(
  tx: Queryable,
  order: Pick<Order, "id" | "user_id">,
  refundId: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await lockCredit(tx, order.user_id);
  await addEntry(tx, {
    user_id: order.user_id,
    amount: -amount,
    kind: "adjusted",
    order_id: order.id,
    refund_id: refundId,
    note: "Refund failed at the bank: credit taken back",
  });
}

/** The first moment of now's month (UTC), from which the monthly cap counts. */
export const monthStart = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/**
 * Pays out referrals whose order was delivered pay_after_days ago and
 * wasn't refunded first: the referrer earns the reward the referral was
 * made with, lapsing under the rule as of now. A referrer already paid
 * monthly_cap referrals this month gets nothing for it (capped). Resolves
 * to how many of each.
 */
export async function payReferrals(db: Pool, now: Date) {
  return withTx(db, async (tx) => {
    const rule = await loadReferralRule(tx);
    let earned = 0;
    let capped = 0;
    for (const referral of await listDueReferrals(tx, {
      now,
      max_rows: BATCH,
    })) {
      await lockCredit(tx, referral.referrer_id);
      const paid =
        rule.monthly_cap === null
          ? 0
          : ((
              await countEarnedSince(tx, {
                referrer_id: referral.referrer_id,
                since: monthStart(now),
              })
            )?.count ?? 0);
      if (rule.monthly_cap !== null && paid >= rule.monthly_cap) {
        await settleReferral(tx, {
          id: referral.id,
          status: "capped",
          settled_at: now,
        });
        capped++;
        continue;
      }
      await settleReferral(tx, {
        id: referral.id,
        status: "earned",
        settled_at: now,
      });
      await addEntry(tx, {
        user_id: referral.referrer_id,
        amount: referral.reward,
        kind: "earned",
        referral_id: referral.id,
        order_id: referral.order_id,
        expires_at: expiryFrom(now, rule.credit_expiry_months),
      });
      earned++;
    }
    return { earned, capped };
  });
}

/**
 * Expires what's left of credit that lapsed by now, one customer at a
 * time: an expired row per lot (0 for a lot already spent, so it isn't
 * looked at again). Resolves to how much was expired, in cents.
 */
export async function expireCredit(db: Pool, now: Date): Promise<number> {
  let expired = 0;
  for (const { user_id } of await listUsersWithLapsedCredit(db, {
    now,
    max_rows: BATCH,
  })) {
    expired += await withTx(db, async (tx) => {
      await lockCredit(tx, user_id);
      const { lots } = await loadCredit(tx, user_id, now);
      let total = 0;
      for (const lot of lots) {
        if (lot.closed || !lapsed(lot, now)) continue;
        const left = Math.max(lot.remaining, 0);
        await addEntry(tx, {
          user_id,
          amount: left === 0 ? 0 : -left,
          kind: "expired",
          lot_id: lot.id,
        });
        total += left;
      }
      return total;
    });
  }
  return expired;
}

/** The hourly credit job: payouts, then expiry. */
export async function settleCredit(db: Pool, now = new Date()) {
  const { earned, capped } = await payReferrals(db, now);
  if (earned + capped > 0) log.info("referral payouts", { earned, capped });
  const expired = await expireCredit(db, now);
  if (expired > 0) log.info("credit expiry", { expired });
  return { earned, capped, expired };
}
