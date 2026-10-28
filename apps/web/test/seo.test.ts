import { describe, expect, test } from "bun:test";
import type {
  CategoryNode,
  ProductDetail,
  StorefrontVariant,
} from "@repo/types";
import { cloudinaryJpeg } from "@/lib/cloudinary";
import {
  breadcrumbLd,
  categoryCrumbs,
  productLd,
  storeLd,
} from "@/lib/seo/structured-data";
import { metaDescription } from "@/lib/seo/text";
import { DEFAULT_SHIPPING } from "@/lib/shipping";

const ORIGIN = "https://shop.example";
const T = "2026-10-01T00:00:00Z";

const product: ProductDetail = {
  id: "p1",
  name: "Merino Crew Sweater",
  slug: "merino-crew-sweater",
  category_id: "c2",
  description: "Soft merino.",
  features: [],
  images: ["https://img.example/a.jpg"],
  image_public_ids: [],
  is_active: true,
  is_featured: false,
  created_at: T,
  updated_at: T,
  rating_count: 0,
  rating_avg: 0,
  variant_id: "v1",
  selling_price: 8900,
  offer_price: null,
  price: 8900,
  in_stock: true,
  stock: 3,
  variant_images: [],
};

function variant(
  id: string,
  over: Partial<StorefrontVariant> = {},
): StorefrontVariant {
  return {
    id,
    product_id: "p1",
    sku: `SKU-${id}`,
    stock: 3,
    images: [],
    selling_price: 8900,
    offer_price: null,
    price: 8900,
    offer_expires_at: null,
    is_default: id === "v1",
    created_at: T,
    options: [],
    ...over,
  };
}

const path: CategoryNode[] = [
  {
    id: "c1",
    name: "Clothing",
    slug: "clothing",
    parent_id: null,
    created_at: T,
    updated_at: T,
    depth: 0,
  },
  {
    id: "c2",
    name: "Knitwear",
    slug: "knitwear",
    parent_id: "c1",
    created_at: T,
    updated_at: T,
    depth: 1,
  },
];

// The fields under test, typed loosely: the builders return plain objects.
type Offer = {
  price: string;
  availability: string;
  priceValidUntil?: string;
  shippingDetails: { shippingRate: { value: number } };
  hasMerchantReturnPolicy: { merchantReturnDays: number };
};
type Ld = Record<string, unknown> & {
  offers?: Offer;
  hasVariant?: (Record<string, unknown> & { offers: Offer })[];
};

describe("productLd", () => {
  test("one variant is a Product with a single offer", () => {
    const ld = productLd({
      origin: ORIGIN,
      product,
      variants: [variant("v1")],
      path,
      shipping: DEFAULT_SHIPPING,
    }) as Ld;
    expect(ld["@type"]).toBe("Product");
    expect(ld.sku).toBe("SKU-v1");
    expect(ld.url).toBe(`${ORIGIN}/products/merino-crew-sweater`);
    expect(ld.category).toBe("Clothing > Knitwear");
    expect(ld.offers?.price).toBe("89.00");
    expect(ld.offers?.availability).toBe("https://schema.org/InStock");
    expect(ld.offers?.hasMerchantReturnPolicy.merchantReturnDays).toBe(30);
    expect(ld.aggregateRating).toBeUndefined();
  });

  test("several variants are a ProductGroup with an offer each", () => {
    const ld = productLd({
      origin: ORIGIN,
      product: { ...product, rating_count: 4, rating_avg: 4.5 },
      variants: [
        variant("v1", {
          options: [
            { name: "Size", value: "S", type: "text" },
            { name: "Colour", value: "Oat", type: "color" },
          ],
        }),
        variant("v2", {
          stock: 0,
          price: 9900,
          options: [
            { name: "Size", value: "M", type: "text" },
            { name: "Colour", value: "Oat", type: "color" },
            { name: "Fit", value: "Relaxed", type: "text" },
          ],
        }),
      ],
      path,
      shipping: DEFAULT_SHIPPING,
    }) as Ld;
    expect(ld["@type"]).toBe("ProductGroup");
    expect(ld.productGroupID).toBe("p1");
    // "Fit" has no schema.org property, so it isn't declared.
    expect(ld.variesBy).toEqual([
      "https://schema.org/size",
      "https://schema.org/color",
    ]);
    expect(ld.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.5,
      reviewCount: 4,
    });
    const [s, m] = ld.hasVariant!;
    expect(s!.name).toBe("Merino Crew Sweater – S / Oat");
    expect(s!.size).toBe("S");
    expect(s!.color).toBe("Oat");
    expect(s!.image).toEqual(product.images);
    expect(m!.offers.price).toBe("99.00");
    expect(m!.offers.availability).toBe("https://schema.org/OutOfStock");
    expect((m!.offers as unknown as { url: string }).url).toBe(
      `${ORIGIN}/products/merino-crew-sweater?variant=v2`,
    );
  });

  test("shipping follows the store's rule", () => {
    const rate = (price: number, shipping = DEFAULT_SHIPPING) =>
      (
        productLd({
          origin: ORIGIN,
          product,
          variants: [variant("v1", { price })],
          path: [],
          shipping,
        }) as Ld
      ).offers!.shippingDetails.shippingRate.value;
    expect(rate(5_999)).toBe(4.9);
    expect(rate(6_000)).toBe(0);
    expect(rate(6_000, { flat: 590, free_from: 8_000 })).toBe(5.9);
    expect(rate(100_000, { flat: 490, free_from: null })).toBe(4.9);
  });

  test("an offer with an end date sets priceValidUntil", () => {
    const ld = productLd({
      origin: ORIGIN,
      product,
      variants: [
        variant("v1", {
          offer_price: 6900,
          price: 6900,
          offer_expires_at: "2026-12-24T23:59:59Z",
        }),
      ],
      path: [],
      shipping: DEFAULT_SHIPPING,
    }) as Ld;
    expect(ld.offers?.priceValidUntil).toBe("2026-12-24");
    expect(ld.category).toBeUndefined();

    // An end date left over without an active offer doesn't count.
    const lapsed = productLd({
      origin: ORIGIN,
      product,
      variants: [variant("v1", { offer_expires_at: "2026-01-01T00:00:00Z" })],
      path: [],
      shipping: DEFAULT_SHIPPING,
    }) as Ld;
    expect(lapsed.offers?.priceValidUntil).toBeUndefined();
  });

  test("without variants it prices the product itself", () => {
    const ld = productLd({
      origin: ORIGIN,
      product: { ...product, stock: 0 },
      variants: [],
      path: [],
      shipping: DEFAULT_SHIPPING,
    }) as Ld;
    expect(ld.offers?.price).toBe("89.00");
    expect(ld.offers?.availability).toBe("https://schema.org/OutOfStock");
  });
});

describe("breadcrumbs", () => {
  test("Home, then each category, with absolute URLs", () => {
    const ld = breadcrumbLd(ORIGIN, [
      ...categoryCrumbs(path),
      { name: "Sweater", path: "/products/sweater" },
    ]);
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Clothing",
        item: `${ORIGIN}/categories/clothing`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Knitwear",
        item: `${ORIGIN}/categories/knitwear`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: "Sweater",
        item: `${ORIGIN}/products/sweater`,
      },
    ]);
  });
});

test("storeLd links the site to its organization", () => {
  const [org, site] = storeLd(ORIGIN)["@graph"];
  expect(org!.logo).toBe(`${ORIGIN}/brand/icon-512.png`);
  expect(site!.publisher).toEqual({ "@id": `${ORIGIN}/#organization` });
});

describe("metaDescription", () => {
  test("keeps short text, collapsing whitespace", () => {
    expect(metaDescription("  Soft\n merino,  made to last. ")).toBe(
      "Soft merino, made to last.",
    );
  });

  test("cuts long text at a word, without trailing punctuation", () => {
    const text = `${"word ".repeat(30)}end, and more`;
    const cut = metaDescription(text, 40);
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut).toBe("word word word word word word word word…");
  });

  test("cuts a single long word mid-word", () => {
    expect(metaDescription("x".repeat(50), 20)).toBe(`${"x".repeat(19)}…`);
  });
});

test("cloudinaryJpeg crops after existing transformations", () => {
  const base = "https://res.cloudinary.com/demo/image/upload";
  expect(cloudinaryJpeg(`${base}/c_fill,ar_4:5/samples/a.jpg`, 504, 630)).toBe(
    `${base}/c_fill,ar_4:5/c_fill,g_auto,w_504,h_630,f_jpg,q_auto/samples/a.jpg`,
  );
  expect(cloudinaryJpeg("https://img.example/a.jpg", 504, 630)).toBe(
    "https://img.example/a.jpg",
  );
});
