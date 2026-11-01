import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import {
  CreditAdjustBodySchema,
  CreditConfirmBodySchema,
  CreditRedeemBodySchema,
  normalizeReferralCode,
  REFERRAL_CODE_PATTERN,
  ReferralStatusSchema,
  type CreditEntry,
} from "@repo/types";
import { CURRENCY } from "../checkout/shipping";
import {
  confirmCreditRedemption,
  countCreditRedemptionAttempt,
  countReferrals,
  createCreditRedemption,
  getCreditCustomer,
  getReferrerByCode,
  listUserReferrals,
  lockCreditRedemption,
  adminListReferrals,
  searchCreditCustomers,
  type CreditLedger,
} from "../db/gen";
import { withTx, type Pool } from "../db/pool";
import type { Queryable } from "../db/queryable";
import type { Deps } from "../deps";
import { formatMoney, renderCreditCode } from "../emails/render";
import { couponLimit } from "../http/rate-limit";
import { requireAccount, requireAuth, requireRole } from "../http/middleware";
import {
  checkPageInRange,
  offset,
  parsePage,
  pathUuid,
  query,
  userId,
} from "../http/params";
import { fail, ok, paginationMeta } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";
import { containsPattern } from "../lib/text";
import { log, rlog } from "../log";
import {
  addEntry,
  availableCredit,
  creditCap,
  loadCredit,
  lockCredit,
} from "../referrals/credit";
import {
  errReferralNotFound,
  errReferralsOff,
  loadReferralRule,
  maskEmail,
  referralCodeFor,
} from "../referrals/referrals";

// The referral programme for customers (their code, the friends it
// brought, their store credit) and for the admin: every referral, and the
// counter's store credit desk (find a customer, see their ledger, redeem
// credit on an in-store bill with an emailed code, adjust by hand).

const REFERRALS_PAGE_SIZE = 20;
/** How long a counter code works, and how many tries it gets. */
const REDEMPTION_LIFE = 10 * 60_000;
const REDEMPTION_TRIES = 5;

const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

/** Whether code hashes to hash, in constant time. */
function codeMatches(code: string, hash: string): boolean {
  const a = Buffer.from(hashCode(code), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A ledger row as the API sends it (who wrote it and its lot stay inside). */
const creditEntry = (row: CreditLedger): CreditEntry => ({
  id: row.id,
  amount: row.amount,
  kind: row.kind as CreditEntry["kind"],
  order_id: row.order_id,
  referral_id: row.referral_id,
  expires_at: row.expires_at?.toISOString() ?? null,
  note: row.note,
  created_at: row.created_at.toISOString(),
});

const customerNotFound = (res: Response) =>
  fail(res, 404, "CUSTOMER_NOT_FOUND", "Customer not found");

/**
 * A customer's credit as the counter sees it: the balance, what's free to
 * spend, the store's share and the ledger, newest first (expiries of
 * credit already spent left out).
 */
async function creditAccount(db: Queryable, id: string, now: Date) {
  const customer = await getCreditCustomer(db, id);
  if (!customer) return null;
  const { entries, balance } = await loadCredit(db, id, now);
  const { available } = await availableCredit(db, id, now);
  const rule = await loadReferralRule(db);
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email ?? "",
    balance,
    available,
    max_percent: rule.credit_max_percent,
    entries: entries
      .filter((e) => e.amount !== 0)
      .reverse()
      .map(creditEntry),
  };
}

export function referralRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;
  /**
   * What a shared link offers a friend, for the storefront's welcome: no
   * sign-in needed. An unknown code and the programme being off are both
   * REFERRAL_NOT_FOUND, each with its own message. Unknown codes are rate
   * limited, as discount codes are, so codes can't be listed by guessing.
   */
  api.get(
    "/referrals/:code",
    couponLimit(cfg.authRateLimits),
    async (req, res) => {
      const rule = await loadReferralRule(db);
      const refused = rule.enabled ? errReferralNotFound : errReferralsOff;
      const code = normalizeReferralCode(String(req.params.code ?? ""));
      const referrer =
        rule.enabled && REFERRAL_CODE_PATTERN.test(code)
          ? await getReferrerByCode(db, code)
          : null;
      if (!referrer) {
        fail(res, refused.status, refused.code, refused.message);
        return;
      }
      ok(res, 200, "Referral offer fetched", {
        code,
        friend_kind: rule.friend_kind,
        friend_value: rule.friend_value,
        friend_min: rule.friend_min,
      });
    },
  );

  const account = api.group("/account", requireAuth(cfg), requireAccount);

  /**
   * The customer's referral code (made the first time they ask), the
   * programme as it is now, the friends their code brought and their store
   * credit. A 404 while the programme is off.
   */
  account.get("/referrals", async (req, res) => {
    const rule = await loadReferralRule(db);
    if (!rule.enabled) {
      fail(res, 404, "REFERRALS_DISABLED", "Referrals aren't running");
      return;
    }
    const uid = userId(req);
    const code = await referralCodeFor(db, uid);
    const referrals = await listUserReferrals(db, uid);
    const { balance } = await loadCredit(db, uid, new Date());
    ok(res, 200, "Referrals fetched", {
      code,
      rule,
      referrals: referrals.map((r) => ({
        id: r.id,
        friend: maskEmail(r.friend_email),
        status: r.status,
        reward: r.reward,
        created_at: r.created_at,
        // null until the order is delivered
        payout_at: (r.payout_at as Date | null) ?? null,
      })),
      balance,
    });
  });

  /** The customer's store credit, and the most of an order it can pay. */
  account.get("/credit", async (req, res) => {
    const uid = userId(req);
    const now = new Date();
    const { balance, available } = await availableCredit(db, uid, now);
    const rule = await loadReferralRule(db);
    ok(res, 200, "Store credit fetched", {
      balance,
      available,
      max_percent: rule.credit_max_percent,
    });
  });

  const admin = api.group("/admin", requireAuth(cfg), requireRole("admin"));

  /** Every referral, newest first, optionally of one status. */
  admin.get("/referrals", async (req, res) => {
    const page = parsePage(req, res);
    if (page === null) return;
    const raw = query(req, "status");
    const status = raw === "" ? null : ReferralStatusSchema.safeParse(raw);
    if (status && !status.success) {
      fail(res, 400, "INVALID_QUERY_PARAMETER", "Unknown referral status");
      return;
    }
    const filter = status?.data ?? null;
    const total = Number((await countReferrals(db, filter))?.count ?? 0);
    if (!checkPageInRange(res, page, total, REFERRALS_PAGE_SIZE)) return;
    const rows =
      total > 0
        ? await adminListReferrals(db, {
            limit: REFERRALS_PAGE_SIZE,
            offset: offset(page, REFERRALS_PAGE_SIZE),
            status: filter,
          })
        : [];
    ok(
      res,
      200,
      "Referrals fetched",
      rows.map((r) => ({
        ...r,
        payout_at: (r.payout_at as Date | null) ?? null,
      })),
      paginationMeta(total, page, REFERRALS_PAGE_SIZE),
    );
  });

  /** Customers by name or email (at most 20), with their balances. */
  admin.get("/credit/customers", async (req, res) => {
    const q = query(req, "q").trim();
    if (q.length < 2) {
      ok(res, 200, "Customers fetched", []);
      return;
    }
    const now = new Date();
    const rows = await searchCreditCustomers(db, containsPattern(q));
    const customers = [];
    for (const row of rows) {
      const { balance } = await loadCredit(db, row.id, now);
      customers.push({
        id: row.id,
        name: row.name,
        email: row.email ?? "",
        balance,
      });
    }
    ok(res, 200, "Customers fetched", customers);
  });

  const customerId = (req: Request, res: Response) =>
    pathUuid(req, res, "userID", "INVALID_USER_ID", "customer ID");

  /** A customer's balance and ledger. */
  admin.get("/credit/customers/:userID", async (req, res) => {
    const id = customerId(req, res);
    if (!id) return;
    const account = await creditAccount(db, id, new Date());
    if (!account) return customerNotFound(res);
    ok(res, 200, "Store credit fetched", account);
  });

  /**
   * Adds or takes off credit by hand, with the reason. Taking off more
   * than the customer has free to spend is refused.
   */
  admin.post("/credit/customers/:userID/adjust", async (req, res) => {
    const id = customerId(req, res);
    if (!id) return;
    const body = parseBody(CreditAdjustBodySchema, req, res);
    if (!body) return;
    const now = new Date();
    const refused = await withTx(db, async (tx) => {
      if (!(await getCreditCustomer(tx, id))) return "not found";
      await lockCredit(tx, id);
      if (body.amount < 0) {
        const { available } = await availableCredit(tx, id, now);
        if (-body.amount > available) return "not enough";
      }
      await addEntry(tx, {
        user_id: id,
        amount: body.amount,
        kind: "adjusted",
        note: body.note,
        created_by: userId(req),
      });
      return null;
    });
    if (refused === "not found") return customerNotFound(res);
    if (refused === "not enough") {
      fail(
        res,
        409,
        "CREDIT_NOT_ENOUGH",
        "The customer doesn't have that much credit",
      );
      return;
    }
    rlog.info(req, "store credit adjusted", {
      user_id: id,
      amount: body.amount,
    });
    ok(res, 200, "Store credit adjusted", await creditAccount(db, id, now));
  });

  /**
   * Starts paying part of an in-store bill with credit: checks the amount
   * against what the customer has and the store's share of the bill, and
   * emails them a 6-digit code to read out (POST .../confirm).
   */
  admin.post("/credit/customers/:userID/redemptions", async (req, res) => {
    const id = customerId(req, res);
    if (!id) return;
    const body = parseBody(CreditRedeemBodySchema, req, res);
    if (!body) return;
    const mailer = deps.mailer;
    if (!mailer || !cfg.frontendUrl) {
      rlog.warn(req, "credit redemption asked for, but mail is not set up");
      fail(
        res,
        503,
        "MAIL_UNAVAILABLE",
        "Codes can't be emailed right now, so credit can't be used in store.",
      );
      return;
    }
    const customer = await getCreditCustomer(db, id);
    if (!customer?.email) return customerNotFound(res);
    const now = new Date();
    const rule = await loadReferralRule(db);
    const cap = creditCap(body.bill, rule.credit_max_percent);
    if (body.amount > cap) {
      fail(
        res,
        409,
        "CREDIT_OVER_LIMIT",
        `Credit can pay at most ${rule.credit_max_percent}% of the bill here, so up to ${formatCents(cap)}`,
      );
      return;
    }
    const { available } = await availableCredit(db, id, now);
    if (body.amount > available) {
      fail(
        res,
        409,
        "CREDIT_NOT_ENOUGH",
        `The customer has ${formatCents(available)} of credit to use`,
      );
      return;
    }
    const code = String(randomInt(1_000_000)).padStart(6, "0");
    const redemption = await createCreditRedemption(db, {
      user_id: id,
      amount: body.amount,
      bill: body.bill,
      code_hash: hashCode(code),
      expires_at: new Date(now.getTime() + REDEMPTION_LIFE),
      created_by: userId(req),
    });
    if (!redemption) throw new Error("create redemption: no rows");
    const msg = renderCreditCode(
      customer.name,
      code,
      body.amount,
      body.bill,
      CURRENCY,
      cfg.frontendUrl,
    );
    try {
      await mailer.send({ to: customer.email, ...msg });
    } catch (err) {
      log.error("credit redemption: send code", err, { user_id: id });
      fail(
        res,
        503,
        "MAIL_UNAVAILABLE",
        "The code couldn't be emailed. Try again.",
      );
      return;
    }
    ok(res, 201, "Code sent to the customer", {
      id: redemption.id,
      amount: redemption.amount,
      bill: redemption.bill,
      expires_at: redemption.expires_at,
    });
  });

  /**
   * Confirms a counter redemption with the code the customer was emailed:
   * the credit is spent then, if they still have it. A code works once,
   * for 10 minutes, with 5 tries.
   */
  admin.post("/credit/redemptions/:redemptionID/confirm", async (req, res) => {
    const id = pathUuid(
      req,
      res,
      "redemptionID",
      "INVALID_REDEMPTION_ID",
      "redemption ID",
    );
    if (!id) return;
    const body = parseBody(CreditConfirmBodySchema, req, res);
    if (!body) return;
    const now = new Date();
    const outcome = await confirm(db, id, body.code, userId(req), now);
    switch (outcome.kind) {
      case "not found":
        fail(res, 404, "REDEMPTION_NOT_FOUND", "Start the redemption again");
        return;
      case "expired":
        fail(
          res,
          409,
          "CREDIT_CODE_EXPIRED",
          "This code has expired or was used. Send a new one.",
        );
        return;
      case "wrong":
        fail(res, 409, "CREDIT_CODE_INVALID", "That code isn't right");
        return;
      case "not enough":
        fail(
          res,
          409,
          "CREDIT_NOT_ENOUGH",
          "The customer no longer has that much credit",
        );
        return;
    }
    rlog.info(req, "store credit redeemed in store", {
      user_id: outcome.userId,
      redemption: id,
    });
    ok(
      res,
      200,
      "Store credit used",
      await creditAccount(db, outcome.userId, now),
    );
  });
}

/** "€5.00", in the store's currency. */
const formatCents = (cents: number) => formatMoney(cents, CURRENCY);

type Confirmation =
  | { kind: "done"; userId: string }
  | { kind: "not found" | "expired" | "wrong" | "not enough" };

/**
 * Checks a counter code and spends the credit, in one transaction: the
 * redemption is locked, so a code can't be used twice, and so is the
 * customer's credit. A wrong code counts a try (kept even though nothing
 * else is written).
 */
async function confirm(
  db: Pool,
  id: string,
  code: string,
  adminId: string,
  now: Date,
): Promise<Confirmation> {
  const wrong = await withTx(
    db,
    async (tx): Promise<Confirmation | "wrong"> => {
      const r = await lockCreditRedemption(tx, id);
      if (!r) return { kind: "not found" };
      if (
        r.confirmed_at !== null ||
        r.expires_at.getTime() <= now.getTime() ||
        r.attempts >= REDEMPTION_TRIES
      )
        return { kind: "expired" };
      if (!codeMatches(code, r.code_hash)) return "wrong";
      await lockCredit(tx, r.user_id);
      const { available } = await availableCredit(tx, r.user_id, now);
      if (r.amount > available) return { kind: "not enough" };
      await addEntry(tx, {
        user_id: r.user_id,
        amount: -r.amount,
        kind: "spent",
        note: `In store, on a bill of ${formatCents(r.bill)}`,
        created_by: adminId,
      });
      await confirmCreditRedemption(tx, r.id);
      return { kind: "done", userId: r.user_id };
    },
  );
  if (wrong !== "wrong") return wrong;
  await countCreditRedemptionAttempt(db, id);
  return { kind: "wrong" };
}
