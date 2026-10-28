#!/usr/bin/env bun
/**
 * Seeds demo promotions through the running API as the seeded admin: a few
 * discount codes and a sale on two colours, so the bag, the coupon admin
 * and the sale prices have something to show. Run it after the catalog:
 *
 *   bun run db:seed && bun run db:seed:catalog && bun run db:seed:demo
 *
 * Idempotent: codes that already exist are skipped, and the sale is put on
 * again (it replaces those products' offers and restarts its 30 days).
 */
import {
  adminCreateCoupon,
  adminListCoupons,
  adminPutOnSale,
  type Client,
  type CouponBody,
} from "../packages/api-client/src/server.ts";
import { existingProducts, fail, requireEnv, signIn } from "./seed-client.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) =>
  new Date(Date.now() + days * DAY_MS).toISOString();

const coupons: CouponBody[] = [
  // A first-order code: 10% off, once per email.
  { code: "WELCOME10", kind: "percent", value: 10, once_per_customer: true },
  // A seasonal code with a minimum bag and a cap on uses.
  {
    code: "SUMMER20",
    kind: "percent",
    value: 20,
    min_subtotal: 5000,
    ends_at: daysFromNow(60),
    max_redemptions: 100,
  },
  // A fixed amount off a bag of two tees or more.
  { code: "FIVEOFF", kind: "fixed", value: 500, min_subtotal: 3000 },
];

/** The colours on sale, and how much off. */
const SALE = {
  products: ["Heavyweight Tee — Mint", "Heavyweight Tee — Sage"],
  percentOff: 20,
  days: 30,
};

async function existingCodes(client: Client): Promise<Set<string>> {
  const codes = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await adminListCoupons({ client, query: { page } });
    if (!data) fail("list coupons", error);
    data.data.forEach((c) => codes.add(c.code));
    if (page >= data.meta.total_pages) return codes;
  }
}

async function main() {
  const baseUrl = process.env.SEED_API_URL || requireEnv("NEXT_PUBLIC_API_URL");
  const client = await signIn(baseUrl);

  const codes = await existingCodes(client);
  let createdCoupons = 0;
  for (const coupon of coupons) {
    if (codes.has(coupon.code)) continue;
    const { data, error } = await adminCreateCoupon({ client, body: coupon });
    if (!data) fail(`create coupon ${coupon.code}`, error);
    createdCoupons++;
  }

  const productIds = await existingProducts(client);
  const ids = SALE.products.map((name) => {
    const id = productIds.get(name);
    if (!id) throw new Error(`no product ${name}: run db:seed:catalog first`);
    return id;
  });
  const { data, error } = await adminPutOnSale({
    client,
    body: {
      target: { product_ids: ids },
      percent_off: SALE.percentOff,
      ends_at: daysFromNow(SALE.days),
    },
  });
  if (!data) fail("put products on sale", error);

  console.log(
    `demo seeded: ${createdCoupons} coupons created, ${data.data.products} products on sale`,
  );
}

await main();
