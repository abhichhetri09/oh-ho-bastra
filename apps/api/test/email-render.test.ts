import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addressLines,
  formatMoney,
  render,
  renderPasswordReset,
  type EmailItem,
  type EmailOrder,
} from "../src/emails/render";
import { backoff, errorText, LAST_ERROR_LEN } from "../src/emails/worker";

// The port of internal/emails/emails_test.go (render half), plus checks
// that whole emails are byte for byte what the Go templates rendered.

const placed = new Date(Date.UTC(2026, 9, 11, 9, 30));

const testOrder = (): EmailOrder => ({
  number: 1042,
  subtotal: 123450,
  discount: 0,
  coupon_code: null,
  shipping: 800,
  total: 124250,
  currency: "usd",
  shipping_address: {
    full_name: "Ada Lovelace",
    phone: "5550100",
    line1: "1 Loom Lane",
    line2: "",
    city: "London",
    region: "",
    postal_code: "N1 9GU",
    country: "GB",
  },
  tracking_number: "1Z999AA10123456784",
  created_at: placed,
});

const testItems = (): EmailItem[] => [
  {
    product_name: "Wool <script>alert(1)</script> scarf",
    options: [
      { name: "color", value: "Oat" },
      { name: "size", value: "One size" },
    ],
    quantity: 2,
    line_total: 9000,
    image:
      "https://res.cloudinary.com/demo/image/upload/c_fill,ar_4:5/scarf.jpg",
  },
  {
    product_name: "Mug",
    options: [],
    quantity: 1,
    line_total: 1450,
    image: "",
  },
];

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe("render", () => {
  it("renders the shipped email", () => {
    const r = render(
      "order_shipped",
      testOrder(),
      "Ada Lovelace",
      testItems(),
      "http://localhost:3000",
    );
    expect(r.subject).toBe("Your order OHB-1042 is on its way");
    for (const [name, body] of [
      ["html", r.html],
      ["text", r.text],
    ] as const) {
      for (const want of [
        "OHB-1042",
        "Hi Ada,",
        "1Z999AA10123456784",
        "$1,234.50",
        "$8.00",
        "$1,242.50",
        "http://localhost:3000/account/orders/OHB-1042",
        "Oat / One size",
        "London N1 9GU",
        "United Kingdom",
      ]) {
        expect(body, `${name} part lacks ${want}`).toContain(want);
      }
    }
    // product names must be escaped in html
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    // product image should be a jpeg thumbnail
    expect(r.html).toContain(
      "/image/upload/c_fill,g_auto,w_128,h_160,f_jpg,q_auto/c_fill,ar_4:5/scarf.jpg",
    );
    // the header should show the logo mark from the storefront
    expect(r.html).toContain(`src="http://localhost:3000/email/mark.png"`);
    expect(r.html).toContain("11 October 2026");
  });

  it("shows a discount code's line only when there is one", () => {
    const order = {
      ...testOrder(),
      currency: "eur",
      subtotal: 6000,
      discount: 600,
      coupon_code: "SUMMER10",
      shipping: 490,
      total: 5890,
    };
    const r = render("order_confirmed", order, "Ada", testItems(), "");
    expect(r.text).toContain(
      "Subtotal  €60.00\nDiscount (SUMMER10)  −€6.00\nShipping  €4.90\nTotal     €58.90\n",
    );
    expect(r.html).toContain(
      `<tr><td style="padding:3px 0;color:#4a423a;">Discount (SUMMER10)</td><td align="right" style="padding:3px 0;">−€6.00</td></tr>`,
    );
    const plain = render("order_confirmed", testOrder(), "Ada", null, "");
    expect(plain.text).not.toContain("Discount");
    expect(plain.html).not.toContain("Discount");
  });

  it("greets a guest by the address and links to order tracking", () => {
    const r = render(
      "order_shipped",
      testOrder(),
      "Guest",
      null,
      "https://shop.example",
      { guest: true },
    );
    expect(r.text).toContain("Hi Ada,");
    expect(r.text).toContain(
      "Track your order: https://shop.example/orders/track?number=1042",
    );
    expect(r.html).toContain(
      `<a href="https://shop.example/orders/track?number=1042" style="display:inline-block;padding:12px 22px;font-size:14px;color:#faf8f4;text-decoration:none;">Track your order</a>`,
    );
    expect(r.text).not.toContain("/account/orders");

    const account = render(
      "order_shipped",
      testOrder(),
      "Grace Hopper",
      null,
      "https://shop.example",
    );
    expect(account.text).toContain("Hi Grace,");
    expect(account.text).toContain(
      "View your order: https://shop.example/account/orders/OHB-1042",
    );
  });

  it("renders the other kinds", () => {
    const order = { ...testOrder(), shipping: 0 };
    for (const [kind, subject] of [
      ["order_confirmed", "Your order OHB-1042 is confirmed"],
      ["order_refunded", "Your order OHB-1042 has been refunded"],
    ]) {
      const r = render(kind!, order, "", null, "https://shop.example");
      expect(r.subject).toBe(subject);
      // Tracking belongs to the shipped email only.
      expect(r.text).not.toContain("1Z999AA10123456784");
      expect(r.text).toContain("Hi,");
      expect(r.text).toContain("Shipping  Free");
    }
    expect(() => render("order_lost", order, "", null, "")).toThrow(
      'unknown email kind "order_lost"',
    );
  });

  it("matches the Go templates byte for byte", () => {
    const r = render(
      "order_shipped",
      testOrder(),
      "Ada Lovelace",
      testItems(),
      "http://localhost:3000",
    );
    expect(r.text).toBe(`Your order is on its way
Order OHB-1042 · 11 October 2026

Hi Ada,

Good news: your order has left the studio and is on its way to you.

Tracking number: 1Z999AA10123456784

View your order: http://localhost:3000/account/orders/OHB-1042

2 × Wool <script>alert(1)</script> scarf (Oat / One size)  $90.00
1 × Mug  $14.50

Subtotal  $1,234.50
Shipping  $8.00
Total     $1,242.50

Shipping to:
Ada Lovelace
1 Loom Lane
London N1 9GU
United Kingdom

--
Oh Ho Bastra
http://localhost:3000
`);
    // The HTML as Go's html/template rendered it.
    expect(sha256(r.html)).toBe(
      "ef97a007aaa6eea86b9ef82393cb7c2b677e462bc82ef85d0354a6d9a78a51fc",
    );

    // Escaping in text, attributes and URLs (javascript: is filtered,
    // spaces and non-ASCII percent-encoded), odd snapshots and money.
    const odd = render(
      "order_refunded",
      {
        number: 123456,
        subtotal: 250000,
        discount: 0,
        coupon_code: null,
        shipping: 1,
        total: -1050,
        currency: "gbp",
        shipping_address: {
          full_name: "  O'Brien & <Sons>  ",
          line1: '"Quoted" + plus',
          city: "",
          region: "Ulster",
          postal_code: "",
          country: "XX",
          Line2: "case key",
        },
        tracking_number: null,
        created_at: new Date(Date.UTC(2026, 2, 9)),
      },
      "  Zíggy  Stardust & <Co> ",
      [
        {
          product_name: `Tee 'quote' "dq" & + plus`,
          options: [
            { value: "Black & <b>" },
            { value: "" },
            null,
            { Value: "M+L" },
          ],
          quantity: 3,
          line_total: 3000,
          image: "https://cdn.example/a b/é.jpg?x=1&y='q'%2Fok%zz",
        },
        {
          product_name: "Evil",
          options: { value: "x" },
          quantity: 1,
          line_total: 0,
          image: "javascript:alert(1)",
        },
        {
          product_name: "Typed",
          options: [{ value: 5 }],
          quantity: 1,
          line_total: 99,
          image: "HTTPS://res.cloudinary.com/x/image/upload/a.png",
        },
        {
          product_name: "Data",
          options: [{ value: "a" }],
          quantity: 1,
          line_total: 100,
          image: "/relative/p:a.png",
        },
      ],
      "https://shop.example/x?a=1&b='2'",
    );
    expect(sha256(odd.html)).toBe(
      "16d9779772a46fd9eab2d79bf9fb250e47d4f6d7177e512d0d59f58fbe0f361d",
    );
    expect(sha256(odd.text)).toBe(
      "9132889ca633b5a3d1f8b171f7a59ea1a7b2f59d475e9a7a0457333dd9d6e9e7",
    );
    expect(odd.html).toContain(`src="#ZgotmplZ"`);
    expect(odd.html).toContain(
      `src="https://cdn.example/a%20b/%c3%a9.jpg?x=1&amp;y=%27q%27%2Fok%25zz"`,
    );
  });
});

describe("addressLines", () => {
  it("lays out the snapshot", () => {
    const got = addressLines({
      full_name: "Grace Hopper",
      line1: "1 Main St",
      line2: "Apt 2",
      city: "Austin",
      region: "TX",
      postal_code: "78701",
      country: "US",
    });
    expect(got).toEqual([
      "Grace Hopper",
      "1 Main St",
      "Apt 2",
      "Austin, TX 78701",
      "United States",
    ]);
    // a bad snapshot gives no address
    expect(addressLines("not json")).toBeNull();
    expect(addressLines({ city: 5 })).toBeNull();
    expect(addressLines(null)).toEqual([]);
  });
});

describe("formatMoney", () => {
  it("formats minor units", () => {
    for (const [cents, want] of [
      [0, "$0.00"],
      [5, "$0.05"],
      [2900, "$29.00"],
      [123456789, "$1,234,567.89"],
      [-1050, "-$10.50"],
    ] as const) {
      expect(formatMoney(cents, "usd")).toBe(want);
    }
    expect(formatMoney(123450, "eur")).toBe("€1,234.50");
    expect(formatMoney(250000, "gbp")).toBe("2,500.00 GBP");
  });
});

describe("worker helpers", () => {
  it("backs off 1, 2, 4... minutes, at most an hour", () => {
    const minute = 60_000;
    const want = [1, 2, 4, 8, 16, 32, 60, 60].map((m) => m * minute);
    want.forEach((w, i) => expect(backoff(i + 1), `backoff(${i + 1})`).toBe(w));
  });

  it("cuts the error text without splitting a character", () => {
    const s = "a".repeat(LAST_ERROR_LEN - 1) + "é";
    const got = errorText(s);
    expect(Buffer.byteLength(got)).toBe(LAST_ERROR_LEN - 1);
    expect(s.startsWith(got)).toBe(true);
  });
});

describe("renderPasswordReset", () => {
  it("links to the reset page with the token escaped", () => {
    const r = renderPasswordReset(
      "Ada Lovelace",
      "tok+/=en",
      "https://shop.example/",
    );
    const link = "https://shop.example/auth/reset?token=tok%2B%2F%3Den";
    expect(r.text).toContain(link);
    expect(r.html).toContain(link);
    expect(r.text).toContain("Hi Ada,");
    expect(r.subject).toBe("Reset your Oh Ho Bastra password");
    // As the Go templates rendered it.
    expect(sha256(r.html)).toBe(
      "dbeb1a17fcc94eeabf3bef359034644504ac0b15b6ba706a42f3030a8a9d66e8",
    );
    expect(sha256(r.text)).toBe(
      "de13786c346edb3cb82c138478d507889e2f5f640e92433702fb63fba210f13e",
    );

    const odd = renderPasswordReset(
      "",
      "a b~c*!'()é_-.",
      "http://x.test/a&b//",
    );
    expect(odd.text).toContain(
      "http://x.test/a&b/auth/reset?token=a+b~c%2A%21%27%28%29%C3%A9_-.",
    );
    expect(sha256(odd.html)).toBe(
      "064593f6cbc255024e114aaa162e46ce0477b8816564cdc150e961b84ba29f68",
    );
    expect(sha256(odd.text)).toBe(
      "3847ef33fc7d21253c47b115eed6dd6bcba220a85475fbcef749402661a18f65",
    );
  });
});
