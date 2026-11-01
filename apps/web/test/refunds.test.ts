import { describe, expect, test } from "bun:test";
import type { AdminOrderDetail } from "@repo/types";
import { fulfilmentStatus } from "@/modules/checkout/lib/orders";
import {
  allocateDiscount,
  previewRefund,
  splitRefund,
} from "@/modules/admin/lib/refund-math";

// The refund dialog's preview mirrors the API's math
// (apps/api/src/checkout/refunds.ts; its tests have the same cases).

const order = (over: Partial<AdminOrderDetail> = {}) =>
  ({
    total: 5491 - 1000,
    credit: 0,
    discount: 1000,
    shipping: 490,
    items: [
      { id: "a", quantity: 3, line_total: 3000 },
      { id: "b", quantity: 1, line_total: 2001 },
    ],
    refunds: [],
    ...over,
  }) as unknown as AdminOrderDetail;

describe("refund preview", () => {
  test("discount shares add up", () => {
    const got = allocateDiscount(
      [
        { id: "a", line_total: 3000 },
        { id: "b", line_total: 2001 },
        { id: "c", line_total: 1 },
      ],
      1000,
    );
    expect(Object.fromEntries(got)).toEqual({ a: 600, b: 400, c: 0 });
  });

  test("a unit is worth what was paid for it", () => {
    const p = previewRefund(order(), {
      quantities: { a: 1 },
      shipping: true,
      extra: 0,
    });
    // (3000 − 600) / 3 = 800, plus shipping
    expect(p.items).toBe(800);
    expect(p.total).toBe(1290);
    expect(p.card).toBe(1290);
    expect(p.tooMuch).toBe(false);
  });

  test("counts earlier refunds, and refuses an extra past what's left", () => {
    const o = order({
      refunds: [
        {
          status: "succeeded",
          amount_card: 800,
          amount_credit: 0,
          shipping: false,
          lines: [{ order_item_id: "a", quantity: 1 }],
        },
        // A failed refund doesn't count.
        {
          status: "failed",
          amount_card: 2001,
          amount_credit: 0,
          shipping: false,
          lines: [{ order_item_id: "b", quantity: 1 }],
        },
      ] as AdminOrderDetail["refunds"],
    });
    const p = previewRefund(o, { quantities: {}, shipping: false, extra: 0 });
    expect(p.left).toBe(4491 - 800);
    expect(p.lines.map((l) => l.left)).toEqual([2, 1]);
    expect(
      previewRefund(o, { quantities: {}, shipping: false, extra: 99_999 })
        .tooMuch,
    ).toBe(true);
  });

  test("splits card and credit as the order was paid", () => {
    expect(
      splitRefund({
        paidCard: 3001,
        paidCredit: 1000,
        refundedCard: 0,
        refundedCredit: 0,
        amount: 1001,
      }),
    ).toEqual({ card: 751, credit: 250 });
  });

  test("a partly refunded order is still on its way", () => {
    const at = "2026-10-10T00:00:00Z";
    expect(
      fulfilmentStatus({
        status: "partially_refunded",
        shipped_at: null,
        delivered_at: null,
      }),
    ).toBe("paid");
    expect(
      fulfilmentStatus({
        status: "partially_refunded",
        shipped_at: at,
        delivered_at: null,
      }),
    ).toBe("shipped");
    expect(
      fulfilmentStatus({
        status: "refunded",
        shipped_at: at,
        delivered_at: at,
      }),
    ).toBe("refunded");
  });
});
