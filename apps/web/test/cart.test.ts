import { describe, expect, test } from "bun:test";
import type { CartCoupon, CartLine } from "@repo/types";
import type {
  ProductDetail,
  StorefrontVariant,
  WishlistProduct,
} from "@repo/types";
import {
  addLine,
  EMPTY_CART,
  type LinePreview,
  optionSummary,
  productPreview,
  removeCoupon,
  removeLine,
  savedPreview,
  setLineQuantity,
  unitCount,
  withTotals,
} from "@/modules/cart/lib/cart-math";
import {
  couponDiscount,
  couponRefusalMessage,
  couponSummary,
  isCouponIssue,
  repriceCoupon,
} from "@/modules/cart/lib/coupon";
import { formatDiscount, formatPriceShort } from "@/lib/money";
import { shippingFor } from "@/lib/shipping";

const line = (over: Partial<CartLine>): CartLine => ({
  variant_id: "v1",
  quantity: 1,
  added_at: "2026-10-10T00:00:00Z",
  product_id: "p1",
  product_name: "Tee",
  product_slug: "tee",
  sku: null,
  stock: 10,
  image: "",
  selling_price: 2000,
  offer_price: null,
  price: 2000,
  available: true,
  options: [],
  line_total: 2000,
  max_quantity: 10,
  ...over,
});

describe("cart math", () => {
  test("totals skip lines that can't be checked out", () => {
    const cart = withTotals([
      line({ variant_id: "a", quantity: 2, line_total: 4000 }),
      line({ variant_id: "b", quantity: 3, stock: 1 }), // short
      line({ variant_id: "c", available: false }), // off sale
    ]);
    expect(cart).toMatchObject({
      item_count: 2,
      subtotal: 4000,
      has_issues: true,
    });
    // the badge counts every unit, ready or not
    expect(unitCount(cart)).toBe(6);
    expect(unitCount(undefined)).toBe(0);
    expect(EMPTY_CART).toEqual({
      items: [],
      item_count: 0,
      subtotal: 0,
      discount: 0,
      shipping: 0,
      total: 0,
      coupon: null,
      has_issues: false,
    });
  });

  test("quantity changes reprice the line and the totals", () => {
    const cart = withTotals([
      line({ variant_id: "a" }),
      line({ variant_id: "b", price: 500 }),
    ]);
    const next = setLineQuantity(cart, "b", 4);
    expect(next.items[1]).toMatchObject({ quantity: 4, line_total: 2000 });
    expect(next).toMatchObject({ item_count: 5, subtotal: 4000 });
    // fixing a short line clears the issue
    const short = withTotals([line({ quantity: 5, stock: 2 })]);
    expect(setLineQuantity(short, "v1", 2).has_issues).toBe(false);
  });

  test("removing a line", () => {
    const cart = withTotals([
      line({ variant_id: "a" }),
      line({ variant_id: "b" }),
    ]);
    expect(removeLine(cart, "a").items.map((l) => l.variant_id)).toEqual(["b"]);
    expect(removeLine(cart, "a").item_count).toBe(1);
  });

  test("option summary", () => {
    expect(
      optionSummary({
        options: [
          { name: "color", value: "Black", type: "color" },
          { name: "size", value: "M", type: "text" },
        ],
      }),
    ).toBe("Black · M");
  });

  test("shipping is free from the threshold, and for an empty bag", () => {
    expect(shippingFor(5_999)).toBe(490);
    expect(shippingFor(6_000)).toBe(0);
    expect(withTotals([line({ quantity: 3, price: 2000 })])).toMatchObject({
      subtotal: 6000,
      shipping: 0,
      total: 6000,
    });
    expect(withTotals([line({ price: 2000 })])).toMatchObject({
      shipping: 490,
      total: 2490,
    });
    // nothing that can be checked out: nothing to ship
    expect(withTotals([line({ available: false })])).toMatchObject({
      shipping: 0,
      total: 0,
    });
  });
});

describe("optimistic add", () => {
  const preview: LinePreview = {
    variant_id: "new",
    product_id: "p2",
    product_name: "Mug",
    product_slug: "mug",
    sku: null,
    stock: 4,
    image: "",
    selling_price: 1500,
    offer_price: null,
    price: 1500,
    options: [],
  };

  test("grows an existing line, up to what it can hold", () => {
    const cart = withTotals([line({ quantity: 9, line_total: 18000 })]);
    const once = addLine(cart, "v1", 1);
    expect(once.items[0]).toMatchObject({ quantity: 10, line_total: 20000 });
    expect(once.item_count).toBe(10);
    // at the cap: unchanged, the API says why
    expect(addLine(once, "v1", 1).items[0]?.quantity).toBe(10);
    // a line already above its stock never shrinks
    const over = withTotals([line({ quantity: 5, stock: 2, max_quantity: 2 })]);
    expect(addLine(over, "v1", 1).items[0]?.quantity).toBe(5);
  });

  test("appends a new line from its preview", () => {
    const cart = withTotals([line({})]);
    const next = addLine(cart, "new", 2, preview);
    expect(next.items).toHaveLength(2);
    expect(next.items[1]).toMatchObject({
      variant_id: "new",
      quantity: 2,
      line_total: 3000,
      available: true,
      max_quantity: 4,
    });
    expect(next).toMatchObject({ item_count: 3, subtotal: 5000 });
  });

  test("waits for the API without a preview", () => {
    const cart = withTotals([line({})]);
    expect(addLine(cart, "new", 1)).toBe(cart);
  });

  test("previews the chosen variant, else the default", () => {
    const product = {
      id: "p1",
      name: "Tee",
      slug: "tee",
      variant_id: "default",
      stock: 3,
      images: ["https://x/p.jpg"],
      variant_images: ["https://x/default.jpg"],
      selling_price: 2000,
      offer_price: 1500,
      price: 1500,
    } as ProductDetail;
    const variant = {
      id: "v2",
      sku: "TEE-M",
      stock: 7,
      images: [],
      selling_price: 2200,
      offer_price: null,
      price: 2200,
      options: [{ name: "Size", value: "M", type: "text" }],
    } as unknown as StorefrontVariant;

    expect(productPreview(product, undefined)).toMatchObject({
      variant_id: "default",
      stock: 3,
      image: "https://x/default.jpg",
      offer_price: 1500,
      price: 1500,
      options: [],
    });
    // no photos of its own: the product's
    expect(productPreview(product, variant)).toMatchObject({
      variant_id: "v2",
      sku: "TEE-M",
      stock: 7,
      image: "https://x/p.jpg",
      offer_price: null,
      price: 2200,
    });
  });

  test("previews a saved product's only variant", () => {
    const saved = {
      id: "p1",
      name: "Tee",
      slug: "tee",
      variant_id: "v1",
      images: [],
      selling_price: 2000,
      offer_price: null,
      price: 2000,
    } as unknown as WishlistProduct;
    expect(savedPreview(saved)).toMatchObject({
      variant_id: "v1",
      image: "",
      price: 2000,
      options: [],
    });
  });
});

describe("discount codes", () => {
  const coupon = (over: Partial<CartCoupon> = {}): CartCoupon => ({
    code: "SUMMER10",
    kind: "percent",
    value: 10,
    discount: 0,
    issue: null,
    ...over,
  });

  test("the maths match the API's", () => {
    expect(couponDiscount("percent", 15, 3333)).toBe(499); // rounded down
    expect(couponDiscount("percent", 100, 2500)).toBe(2500);
    expect(couponDiscount("fixed", 500, 2500)).toBe(500);
    expect(couponDiscount("fixed", 5000, 2500)).toBe(2500); // capped
    expect(couponDiscount("fixed", 500, 0)).toBe(0);
  });

  test("totals take the discount off before shipping", () => {
    const cart = withTotals([line({ quantity: 3, price: 2000 })], coupon());
    expect(cart).toMatchObject({
      subtotal: 6000,
      discount: 600,
      // 5400 after the code: below the free threshold
      shipping: 490,
      total: 5890,
      coupon: { discount: 600 },
    });
    // a quantity change reprices the code
    expect(setLineQuantity(cart, "v1", 1)).toMatchObject({
      subtotal: 2000,
      discount: 200,
      total: 2290,
      coupon: { code: "SUMMER10", discount: 200 },
    });
    expect(removeCoupon(cart)).toMatchObject({
      coupon: null,
      discount: 0,
      shipping: 0,
      total: 6000,
    });
  });

  test("a code with an issue takes nothing off", () => {
    const issue = {
      code: "COUPON_MIN_SUBTOTAL" as const,
      message: "This code needs a subtotal of €50.00 or more",
    };
    expect(repriceCoupon(coupon({ issue, discount: 0 }), 9000)).toMatchObject({
      discount: 0,
      issue,
    });
    expect(
      repriceCoupon(coupon({ kind: null, value: null, discount: 5 }), 9000),
    ).toMatchObject({ discount: 0 });
    expect(repriceCoupon(null, 9000)).toBeNull();
    const cart = withTotals([line({ price: 2000 })], coupon({ issue }));
    expect(cart).toMatchObject({ discount: 0, total: 2490 });
  });

  test("words the code and checkout's refusal", () => {
    expect(couponSummary(coupon(), formatPriceShort)).toBe("10% off");
    expect(
      couponSummary(coupon({ kind: "fixed", value: 500 }), formatPriceShort),
    ).toBe("€5 off");
    expect(
      couponSummary(coupon({ kind: null, value: null }), formatPriceShort),
    ).toBe("");
    expect(formatDiscount(600)).toBe("−€6.00");
    expect(isCouponIssue("COUPON_EXPIRED")).toBe(true);
    expect(isCouponIssue("CART_EMPTY")).toBe(false);
    expect(isCouponIssue(undefined)).toBe(false);
    expect(couponRefusalMessage("SUMMER10", "This code has expired")).toBe(
      "Your code SUMMER10 can't be used: this code has expired. Remove it from your bag, or change your bag, to check out.",
    );
  });
});
