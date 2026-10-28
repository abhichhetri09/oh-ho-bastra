import type { Request, Response } from "express";
import { z } from "zod";
import {
  CheckoutBodySchema,
  SHIPPING_COUNTRIES,
  type ValidationCode,
} from "@repo/types";
import { EmailField } from "../auth/schemas";
import { Refusal, type CheckoutService } from "../checkout/service";
import {
  clearDefaultAddress,
  countOrders,
  deleteAddress,
  getOrderByNumber,
  getOrderBySession,
  getOrderItems,
  listAddresses,
  listOrders,
  listReviewedProductIDs,
  lockAddresses,
  lookupOrder,
  setDefaultAddress,
  type Order,
} from "../db/gen";
import { withTx } from "../db/pool";
import type { Deps } from "../deps";
import { requireAccount, requireAuth } from "../http/middleware";
import {
  checkPageInRange,
  isUuid,
  offset,
  parsePage,
  pathUuid,
  userId,
} from "../http/params";
import { orderLookupLimit } from "../http/rate-limit";
import {
  fail,
  internal,
  ok,
  paginationMeta,
  validationFailed,
} from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";
import { log, rlog } from "../log";
import { goInt } from "../shopping/validation";
import {
  InvalidSignatureError,
  type PaymentProvider,
} from "../services/payments";

// Checkout, the Stripe webhook, orders and the address book (the port of
// internal/handlers/checkout). The rules live in src/checkout.

/** The order history page (an infinite list in the web). */
const ORDERS_PAGE_SIZE = 10;
/** Bounds what the webhook reads; Stripe events are small. */
const MAX_WEBHOOK_BODY = 1 << 16;

// The request body as Go's binding tags checked it. The shared zod schema
// trims before measuring and reports blank strings as missing; Go measured
// the raw string (in runes) and said "cannot be blank". Its uuid rule took
// any hex UUID, not only RFC 9562 versions.

const issue = (ctx: z.RefinementCtx, code: ValidationCode, message: string) =>
  ctx.addIssue({ code: "custom", message, params: { code } });

const runes = (s: string) => [...s].length;

/** A string field with Go's required, not_blank, min and max, in tag order. */
function goString(
  label: string,
  rules: { required?: boolean; min?: number; max: number },
) {
  return z.string().superRefine((s, ctx) => {
    if (rules.required) {
      if (s === "") return issue(ctx, "REQUIRED_FIELD", `${label} is required`);
      if (s.trim() === "")
        return issue(ctx, "BLANK_FIELD", `${label} cannot be blank`);
    }
    if (rules.min !== undefined && runes(s) < rules.min) {
      return issue(
        ctx,
        "TOO_SHORT",
        `${label} must be at least ${rules.min} characters`,
      );
    }
    if (runes(s) > rules.max)
      return issue(
        ctx,
        "TOO_LONG",
        `${label} cannot exceed ${rules.max} characters`,
      );
  });
}

const GoAddressInput = z.object({
  full_name: goString("Full name", { required: true, max: 80 }),
  phone: goString("Phone", { required: true, min: 6, max: 20 }),
  line1: goString("Line1", { required: true, max: 120 }),
  line2: goString("Line2", { max: 120 }).optional(),
  city: goString("City", { required: true, max: 80 }),
  region: goString("Region", { max: 80 }).optional(),
  postal_code: goString("Postal code", { required: true, max: 12 }),
  country: z.string().superRefine((s, ctx) => {
    if (s === "") return issue(ctx, "REQUIRED_FIELD", "Country is required");
    if (!(SHIPPING_COUNTRIES as readonly string[]).includes(s)) {
      issue(
        ctx,
        "INVALID_VALUE",
        `Country must be one of: ${SHIPPING_COUNTRIES.join(", ")}`,
      );
    }
  }),
});

const CheckoutBody = CheckoutBodySchema.extend({
  email: EmailField.optional(),
  address_id: z
    .string()
    .superRefine((s, ctx) => {
      if (!isUuid(s))
        issue(ctx, "INVALID_UUID", "Address id must be a valid ID");
    })
    .optional(),
  address: GoAddressInput.optional(),
});

// An order by its number and email, for shoppers without an account.
const LookupBody = z.object({
  number: goInt("Order number", 1, Number.MAX_SAFE_INTEGER),
  email: EmailField,
});

function unavailable(res: Response) {
  fail(
    res,
    503,
    "PAYMENTS_UNAVAILABLE",
    "Payments are not set up on this server",
  );
}

/** Sends a checkout refusal, or a 500 for anything else. */
function failRefusal(req: Request, res: Response, msg: string, err: unknown) {
  if (err instanceof Refusal) {
    fail(res, err.status, err.code, err.message);
    return;
  }
  internal(req, res, msg, err);
}

/** The webhook's body as received, at most MAX_WEBHOOK_BODY bytes. */
async function rawBody(req: Request): Promise<Buffer> {
  if (req.rawBody) return req.rawBody.subarray(0, MAX_WEBHOOK_BODY);
  // Not parsed as JSON (another content type): read it here.
  if (req.readableEnded) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    chunks.push(buf);
    size += buf.length;
    if (size >= MAX_WEBHOOK_BODY) break;
  }
  return Buffer.concat(chunks).subarray(0, MAX_WEBHOOK_BODY);
}

/**
 * The :number path parameter as Go's strconv.ParseInt read it (an
 * optional sign, decimal digits, int64), or null when it isn't one or is
 * below 1. A number past 2^53 can't be an order's, so it is
 * Number.MAX_SAFE_INTEGER + 1 (not found) rather than a rounded neighbour.
 */
function parseOrderNumber(raw: string): number | null {
  if (!/^[+-]?\d+$/.test(raw)) return null;
  const n = BigInt(raw);
  if (n < 1n || n > 9223372036854775807n) return null;
  return n > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER + 1
    : Number(n);
}

export function checkoutRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;
  const svc = (): CheckoutService => deps.checkout;
  const auth = requireAuth(cfg);

  /** Reserves the cart and returns the Stripe Checkout URL. */
  api.post("/checkout", auth, async (req, res) => {
    if (!svc().enabled()) return unavailable(res);
    const uid = userId(req);
    const body = parseBody(CheckoutBody, req, res);
    if (body === null) return;
    // A guest says where its order emails go, and has no address book.
    if (req.auth?.role === "guest") {
      if (!body.email) {
        validationFailed(res, [
          {
            code: "REQUIRED_FIELD",
            field: "email",
            message: "Email is required",
          },
        ]);
        return;
      }
      if (body.address_id) {
        validationFailed(res, [
          {
            code: "INVALID_VALUE",
            field: "address_id",
            message: "Enter the address to ship to",
          },
        ]);
        return;
      }
    }
    if (!body.address_id === !body.address) {
      fail(res, 400, "VALIDATION_FAILED", "Give either address_id or address");
      return;
    }
    try {
      ok(res, 201, "Checkout started", await svc().start(uid, body));
    } catch (err) {
      failRefusal(req, res, "failed to start checkout", err);
    }
  });

  /**
   * The success page's view of a checkout: the order behind a Stripe
   * session. A pending order is first reconciled with Stripe, so the page
   * works even before (or without) the webhook.
   */
  api.get("/checkout/sessions/:sessionID", auth, async (req, res) => {
    if (!svc().enabled()) return unavailable(res);
    const uid = userId(req);
    const sessionId = String(req.params.sessionID);
    if (!sessionId.startsWith("cs_") || Buffer.byteLength(sessionId) > 255) {
      fail(res, 400, "INVALID_SESSION_ID", "Invalid checkout session ID");
      return;
    }
    const params = { stripe_session_id: sessionId, user_id: uid };
    let order = await getOrderBySession(db, params);
    if (!order) {
      fail(res, 404, "ORDER_NOT_FOUND", "Order not found");
      return;
    }
    if (order.status === "pending") {
      let reconciled = true;
      try {
        await svc().reconcile(sessionId);
      } catch (err) {
        // The webhook may still settle it; answer with what we know.
        reconciled = false;
        log.warn("checkout: reconcile", {
          order: order.number,
          err: String(err),
        });
      }
      if (reconciled) {
        // Go read the order again here and sent whatever came back.
        const fresh = await getOrderBySession(db, params);
        if (!fresh)
          return internal(
            req,
            res,
            "failed to get order",
            new Error("no rows in result set"),
          );
        order = fresh;
      }
    }
    await respondOrder(res, order);
  });

  /** Applies verified Stripe events. A 5xx makes Stripe retry. The signature is the authentication. */
  api.post("/webhooks/stripe", async (req, res) => {
    if (!svc().enabled()) return unavailable(res);
    const provider: PaymentProvider | null = deps.payments ?? svc().provider;
    if (!provider) return unavailable(res);
    const payload = await rawBody(req);
    let event;
    try {
      event = provider.parseEvent(payload, req.get("Stripe-Signature") ?? "");
    } catch (err) {
      if (err instanceof InvalidSignatureError) {
        fail(
          res,
          400,
          "INVALID_WEBHOOK_SIGNATURE",
          "Invalid webhook signature",
        );
        return;
      }
      return internal(req, res, "failed to read webhook event", err);
    }
    try {
      await svc().handleEvent(event);
    } catch (err) {
      return internal(req, res, "failed to apply webhook event", err, {
        event: event.id,
        type: event.type,
      });
    }
    ok(res, 200, "Event received");
  });

  /**
   * An order found by its number and the email it was placed with, for a
   * shopper without an account (the same answer as GET /orders/:number,
   * without reviews). A wrong email reads as an unknown number; lookups
   * that find nothing are rate limited.
   */
  api.post(
    "/orders/lookup",
    orderLookupLimit(cfg.authRateLimits),
    async (req, res) => {
      const body = parseBody(LookupBody, req, res);
      if (body === null) return;
      const order = await lookupOrder(db, {
        number: body.number,
        email: body.email,
      });
      if (!order) {
        rlog.warn(req, "order lookup found nothing");
        fail(res, 404, "ORDER_NOT_FOUND", "Order not found");
        return;
      }
      await respondOrder(res, order, { reviews: false });
    },
  );

  const orders = api.group("/orders", auth);

  /** The user's order history, newest first (placed orders only, not abandoned checkouts). */
  orders.get("", async (req, res) => {
    const uid = userId(req);
    const page = parsePage(req, res);
    if (page === null) return;
    const total = (await countOrders(db, uid))?.count ?? 0;
    if (!checkPageInRange(res, page, total, ORDERS_PAGE_SIZE)) return;
    const rows =
      total > 0
        ? await listOrders(db, {
            user_id: uid,
            limit: ORDERS_PAGE_SIZE,
            offset: offset(page, ORDERS_PAGE_SIZE),
          })
        : [];
    ok(
      res,
      200,
      "Orders fetched",
      rows,
      paginationMeta(total, page, ORDERS_PAGE_SIZE),
    );
  });

  /** One of the user's orders by its number (1042, not "OHB-1042"). */
  orders.get("/:number", async (req, res) => {
    const uid = userId(req);
    const number = parseOrderNumber(String(req.params.number));
    if (number === null) {
      fail(res, 400, "INVALID_ORDER_NUMBER", "Invalid order number");
      return;
    }
    const order =
      number > Number.MAX_SAFE_INTEGER
        ? null
        : await getOrderByNumber(db, { number, user_id: uid });
    if (!order) {
      fail(res, 404, "ORDER_NOT_FOUND", "Order not found");
      return;
    }
    await respondOrder(res, order);
  });

  /**
   * An order with what was bought, and which of its products the customer
   * has reviewed (never null; empty for a lookup, which can't review).
   */
  async function respondOrder(
    res: Response,
    order: Order,
    { reviews = true }: { reviews?: boolean } = {},
  ) {
    const items = await getOrderItems(db, order.id);
    const reviewed = reviews
      ? await listReviewedProductIDs(db, {
          order_id: order.id,
          user_id: order.user_id,
        })
      : [];
    ok(res, 200, "Order fetched", {
      ...order,
      items,
      reviewed_product_ids: reviewed.map((r) => r.product_id),
    });
  }

  // A guest has no address book.
  const addresses = api.group("/addresses", auth, requireAccount);

  /** The user's address book, the default first, then the newest (at most 10). */
  addresses.get("", async (req, res) => {
    ok(res, 200, "Addresses fetched", await listAddresses(db, userId(req)));
  });

  /** Removes an address from the book. Orders keep their copy. */
  addresses.delete("/:addressID", async (req, res) => {
    const uid = userId(req);
    const id = pathUuid(
      req,
      res,
      "addressID",
      "INVALID_ADDRESS_ID",
      "address ID",
    );
    if (id === null) return;
    if ((await deleteAddress(db, { id, user_id: uid })) === 0) {
      fail(res, 404, "ADDRESS_NOT_FOUND", "Address not found");
      return;
    }
    ok(res, 200, "Address deleted");
  });

  /**
   * Makes one address the default (checkout picks it first) and unmarks the
   * old one. Setting the current default again is a no-op.
   */
  addresses.put("/:addressID/default", async (req, res) => {
    const uid = userId(req);
    const id = pathUuid(
      req,
      res,
      "addressID",
      "INVALID_ADDRESS_ID",
      "address ID",
    );
    if (id === null) return;
    try {
      const address = await withTx(db, async (tx) => {
        // Locked so two of these at once can't both leave a default.
        await lockAddresses(tx, uid);
        await clearDefaultAddress(tx, uid);
        const address = await setDefaultAddress(tx, { id, user_id: uid });
        // Rolls the cleared default back.
        if (!address)
          throw new Refusal(404, "ADDRESS_NOT_FOUND", "Address not found");
        return address;
      });
      ok(res, 200, "Default address updated", address);
    } catch (err) {
      failRefusal(req, res, "set default address", err);
    }
  });
}
