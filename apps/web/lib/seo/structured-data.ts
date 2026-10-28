import {
  SHIPPING_COUNTRIES,
  type CategoryNode,
  type ProductDetail,
  type ShippingRule,
  type StorefrontVariant,
} from "@repo/types";
import { CURRENCY } from "@/lib/money";
import { shippingFor } from "@/lib/shipping";
import { site } from "@/lib/site";

// schema.org JSON-LD for Google's rich results (products with price, stock
// and rating; breadcrumbs; the store's name and logo). Pure builders: the
// caller passes the site origin, so they're easy to test.

const SCHEMA = "https://schema.org";

/** A breadcrumb step: its label and its path on the site. */
export type Crumb = { name: string; path: string };

export function breadcrumbLd(origin: string, crumbs: Crumb[]) {
  return {
    "@context": SCHEMA,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${origin}${crumb.path}`,
    })),
  };
}

/** Home → each category from the root → (optionally) the page itself. */
export function categoryCrumbs(path: CategoryNode[]): Crumb[] {
  return [
    { name: "Home", path: "/" },
    ...path.map((c) => ({ name: c.name, path: `/categories/${c.slug}` })),
  ];
}

/** The store itself, for the home page: its name, logo and site. */
export function storeLd(origin: string) {
  const organization = `${origin}/#organization`;
  return {
    "@context": SCHEMA,
    "@graph": [
      {
        "@type": "Organization",
        "@id": organization,
        name: site.name,
        url: `${origin}/`,
        logo: `${origin}/brand/icon-512.png`,
        description: site.description,
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: site.name,
        url: `${origin}/`,
        publisher: { "@id": organization },
      },
    ],
  };
}

// The store's real rules (its shipping rule from the settings, the
// checkout's country list and site.shippingCopy): the admin's delivery
// price, two to four working days, free returns within 30 days.
function shippingDetails(price: number, shipping: ShippingRule) {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: shippingFor(price, shipping) / 100,
      currency: CURRENCY,
    },
    shippingDestination: SHIPPING_COUNTRIES.map((country) => ({
      "@type": "DefinedRegion",
      addressCountry: country,
    })),
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: 0,
        maxValue: 1,
        unitCode: "DAY",
      },
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: 2,
        maxValue: 4,
        unitCode: "DAY",
      },
    },
  };
}

const RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: SHIPPING_COUNTRIES,
  returnPolicyCategory: `${SCHEMA}/MerchantReturnFiniteReturnWindow`,
  merchantReturnDays: 30,
  returnMethod: `${SCHEMA}/ReturnByMail`,
  returnFees: `${SCHEMA}/FreeReturn`,
};

function offerLd({
  url,
  price,
  inStock,
  offerEndsAt,
  shipping,
}: {
  url: string;
  price: number;
  inStock: boolean;
  offerEndsAt: string | null;
  shipping: ShippingRule;
}) {
  return {
    "@type": "Offer",
    url,
    price: (price / 100).toFixed(2),
    priceCurrency: CURRENCY,
    availability: `${SCHEMA}/${inStock ? "InStock" : "OutOfStock"}`,
    itemCondition: `${SCHEMA}/NewCondition`,
    // A sale price with an end date: say when it stops being valid.
    ...(offerEndsAt && { priceValidUntil: offerEndsAt.slice(0, 10) }),
    shippingDetails: shippingDetails(price, shipping),
    hasMerchantReturnPolicy: RETURN_POLICY,
  };
}

// Option names schema.org has a property for; others still name the
// variant but can't be declared in variesBy.
const OPTION_PROPERTIES: Record<string, string> = {
  color: "color",
  colour: "color",
  size: "size",
  material: "material",
  pattern: "pattern",
};

function optionProperty(name: string): string | undefined {
  return OPTION_PROPERTIES[name.trim().toLowerCase()];
}

function variantLd(
  product: ProductDetail,
  variant: StorefrontVariant,
  productUrl: string,
  shipping: ShippingRule,
) {
  const label = variant.options.map((o) => o.value).join(" / ");
  const url = `${productUrl}?variant=${variant.id}`;
  return {
    "@type": "Product",
    name: label ? `${product.name} – ${label}` : product.name,
    ...(variant.sku && { sku: variant.sku }),
    image: variant.images.length > 0 ? variant.images : product.images,
    ...Object.fromEntries(
      variant.options.flatMap((o) => {
        const property = optionProperty(o.name);
        return property ? [[property, o.value]] : [];
      }),
    ),
    offers: offerLd({
      url,
      price: variant.price,
      inStock: variant.stock > 0,
      offerEndsAt:
        variant.offer_price !== null ? variant.offer_expires_at : null,
      shipping,
    }),
  };
}

/**
 * A product page's structured data. One variant: a Product with one
 * offer. Several: a ProductGroup with a Product per variant, each with its
 * own price, stock and SKU (Google's pattern for variants). Each offer's
 * shipping follows the store's rule.
 */
export function productLd({
  origin,
  product,
  variants,
  path,
  shipping,
}: {
  origin: string;
  product: ProductDetail;
  variants: StorefrontVariant[];
  path: CategoryNode[];
  shipping: ShippingRule;
}) {
  const url = `${origin}/products/${product.slug}`;
  const common = {
    "@context": SCHEMA,
    name: product.name,
    ...(product.description && { description: product.description }),
    url,
    image: product.images,
    ...(path.length > 0 && { category: path.map((c) => c.name).join(" > ") }),
    ...(product.rating_count > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.rating_avg,
        reviewCount: product.rating_count,
      },
    }),
  };

  if (variants.length > 1) {
    const varies = [
      ...new Set(
        variants.flatMap((v) =>
          v.options.flatMap((o) => optionProperty(o.name) ?? []),
        ),
      ),
    ];
    return {
      ...common,
      "@type": "ProductGroup",
      productGroupID: product.id,
      ...(varies.length > 0 && {
        variesBy: varies.map((p) => `${SCHEMA}/${p}`),
      }),
      hasVariant: variants.map((v) => variantLd(product, v, url, shipping)),
    };
  }

  const only = variants[0];
  return {
    ...common,
    "@type": "Product",
    ...(only?.sku && { sku: only.sku }),
    offers: offerLd({
      url,
      price: only?.price ?? product.price,
      inStock: (only?.stock ?? product.stock) > 0,
      offerEndsAt:
        only && only.offer_price !== null ? only.offer_expires_at : null,
      shipping,
    }),
  };
}
