import { describe, expect, test } from "bun:test";
import type { CartLine, CartReferral } from "@repo/types";
import {
  creditFor,
  DEFAULT_REFERRALS,
  referralCodeFrom,
  friendOffer,
  referralLink,
  referralNotice,
  referralPerk,
  referralWelcome,
} from "@/lib/referrals";
import { DEFAULT_SHIPPING } from "@/lib/shipping";
import { withTotals } from "@/modules/cart/lib/cart-math";

const line: CartLine = {
  variant_id: "v1",
  quantity: 1,
  added_at: "2026-10-10T00:00:00Z",
  product_id: "p1",
  product_name: "Tee",
  product_slug: "tee",
  sku: null,
  stock: 10,
  image: "",
  selling_price: 3000,
  offer_price: null,
  price: 3000,
  available: true,
  options: [],
  custom_print: false,
  line_total: 3000,
  max_quantity: 10,
};

describe("referrals", () => {
  test("words the programme as a perk", () => {
    expect(referralPerk(DEFAULT_REFERRALS)).toBe("Give €5, get €5");
    expect(
      referralPerk({
        ...DEFAULT_REFERRALS,
        friend_kind: "percent",
        friend_value: 10,
        reward: 750,
      }),
    ).toBe("Give 10% off, get €7.50");
  });

  test("takes a code from a link, or nothing", () => {
    expect(referralCodeFrom(" ab12cd34 ")).toBe("AB12CD34");
    expect(referralCodeFrom("nope")).toBeNull();
    expect(referralCodeFrom(null)).toBeNull();
    expect(referralLink("https://shop.test/", "AB12CD34")).toBe(
      "https://shop.test/r/AB12CD34",
    );
  });

  test("uses credit up to the store's share, leaving Stripe's minimum", () => {
    const bag = { subtotal: 3000, discount: 0, total: 3490 };
    expect(creditFor(2000, 30, bag)).toBe(1047);
    expect(creditFor(500, 30, bag)).toBe(500);
    expect(creditFor(5000, 100, bag)).toBe(3000);
    expect(creditFor(5000, 100, { subtotal: 60, discount: 0, total: 60 })).toBe(
      10,
    );
  });

  test("the bag takes the better of its code and the referral", () => {
    const referral: CartReferral = {
      code: "AB12CD34",
      discount: 500,
      applied: true,
      issue: null,
    };
    const cart = withTotals([line], null, DEFAULT_SHIPPING, referral);
    expect(cart).toMatchObject({
      discount: 500,
      total: 3000 - 500 + 490,
      referral: { applied: true },
    });
    const coupon = {
      code: "TENOFF",
      kind: "fixed" as const,
      value: 800,
      discount: 800,
      issue: null,
    };
    expect(
      withTotals([line], coupon, DEFAULT_SHIPPING, referral),
    ).toMatchObject({ discount: 800, referral: { applied: false } });
  });

  test("welcomes a friend with the link's real offer", () => {
    const offer = {
      code: "AB12CD34",
      friend_kind: "amount" as const,
      friend_value: 500,
      friend_min: null,
    };
    expect(friendOffer(offer)).toBe("€5");
    expect(referralWelcome(offer)).toBe(
      "You've got €5 off your first order from a friend",
    );
    expect(
      referralWelcome({
        ...offer,
        friend_kind: "percent",
        friend_value: 10,
        friend_min: 4000,
      }),
    ).toBe(
      "You've got 10% off your first order from a friend on orders over €40",
    );
  });

  test("says whether the referral on the bag applies, and why not", () => {
    const referral: CartReferral = {
      code: "AB12CD34",
      discount: 500,
      applied: true,
      issue: null,
    };
    expect(referralNotice(null)).toBeNull();
    expect(referralNotice(referral)).toEqual({
      tone: "applied",
      message: "Friend's discount applied",
    });
    expect(
      referralNotice({
        ...referral,
        applied: false,
        discount: 0,
        issue: {
          code: "REFERRAL_NOT_FOUND",
          message: "Referral offers aren't running right now",
        },
      }),
    ).toEqual({
      tone: "issue",
      message: "Referral offers aren't running right now",
    });
    expect(referralNotice({ ...referral, applied: false })?.tone).toBe(
      "outdone",
    );
  });
});
