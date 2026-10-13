import type { Metadata } from "next";
import { ReviewsSection } from "@/modules/reviews/components/reviews-section";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { formatPriceShort } from "@/lib/money";
import {
  breadcrumbLd,
  categoryCrumbs,
  productLd,
} from "@/lib/seo/structured-data";
import { metaDescription } from "@/lib/seo/text";
import { site } from "@/lib/site";
import { siteUrl } from "@/lib/site-url";
import { getCategories, getProductPage } from "@/modules/catalog/api";
import { Breadcrumbs } from "@/modules/catalog/components/breadcrumbs";
import { ProductRail } from "@/modules/catalog/components/product-rail";
import { ProductView } from "@/modules/catalog/components/product-view";
import { categoryPath } from "@/modules/catalog/lib/category-tree";
import { SectionHeading } from "@/modules/home/components/section-heading";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ variant?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getProductPage(slug);
  if (!page) return { title: "Product not found" };
  const { product_detail: product } = page;
  return {
    title: product.name,
    description: metaDescription(
      product.description ??
        `${product.name}, ${formatPriceShort(product.price)} at ${site.name}.`,
    ),
    // ?variant= links all fold into the product's one URL.
    alternates: { canonical: `/products/${product.slug}` },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const [{ slug }, { variant: variantParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const [page, categories] = await Promise.all([
    getProductPage(slug),
    getCategories(),
  ]);
  if (!page) notFound();

  const { product_detail: product, variants, related_products } = page;
  const category = categories.find((c) => c.id === product.category_id);
  const path = category ? categoryPath(categories, category.slug) : [];

  // ?variant= opens that variant when it is one of this product's.
  const requested = Array.isArray(variantParam)
    ? variantParam[0]
    : variantParam;
  const initialVariantId =
    variants.find((v) => v.id === requested)?.id ??
    variants[0]?.id ??
    product.variant_id;

  const origin = siteUrl();
  const structured = [
    productLd({ origin, product, variants, path }),
    breadcrumbLd(origin, [
      ...categoryCrumbs(path),
      { name: product.name, path: `/products/${product.slug}` },
    ]),
  ];

  return (
    <div className="space-y-28 pt-4 sm:pt-8">
      <JsonLd data={structured} />
      <div className="container-page">
        <ProductView
          // A new product starts from its own default variant.
          key={product.id}
          product={product}
          variants={variants}
          initialVariantId={initialVariantId}
          categoryName={category?.name}
          breadcrumbs={
            path.length > 0 ? <Breadcrumbs path={path} /> : undefined
          }
        />
      </div>

      <div className="container-page">
        <ReviewsSection slug={product.slug} productName={product.name} />
      </div>

      {related_products.length > 0 && (
        <section className="container-page">
          <SectionHeading
            eyebrow="More to discover"
            title="You may also like."
          />
          <ProductRail products={related_products} label="Related products" />
        </section>
      )}
    </div>
  );
}
