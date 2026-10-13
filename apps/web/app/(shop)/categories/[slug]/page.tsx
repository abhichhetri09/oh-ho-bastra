import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd, categoryCrumbs } from "@/lib/seo/structured-data";
import { site } from "@/lib/site";
import { siteUrl } from "@/lib/site-url";
import { getCategories, getListing } from "@/modules/catalog/api";
import { Breadcrumbs } from "@/modules/catalog/components/breadcrumbs";
import { CollectionHeader } from "@/modules/catalog/components/collection-header";
import { ListingPage } from "@/modules/catalog/components/listing-page";
import {
  categoryPath,
  childCategories,
} from "@/modules/catalog/lib/category-tree";
import {
  DEFAULT_FILTERS,
  type SearchParams,
} from "@/modules/catalog/lib/filters";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [categories, listing] = await Promise.all([
    getCategories(),
    getListing(slug, DEFAULT_FILTERS),
  ]);
  const category = categories.find((c) => c.slug === slug);
  if (!category) return { title: "Collection" };
  const total = listing?.meta.total ?? 0;
  return {
    title: category.name,
    description: `Shop ${category.name.toLowerCase()} at ${site.name}: ${total} ${
      total === 1 ? "piece" : "pieces"
    }, made to last and chosen with care.`,
    // Filtered and sorted views fold into the collection's one URL.
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, query, categories] = await Promise.all([
    params,
    searchParams,
    getCategories(),
  ]);
  const path = categoryPath(categories, slug);
  const category = path.at(-1);
  if (!category) notFound();

  // Subcategories as chips; on a leaf, its siblings (with itself active).
  const parent = path.at(-2);
  const children = childCategories(categories, slug);
  const chips =
    children.length > 0
      ? [
          { label: "All", href: `/categories/${slug}`, active: true },
          ...children.map((c) => ({
            label: c.name,
            href: `/categories/${c.slug}`,
          })),
        ]
      : parent
        ? [
            { label: "All", href: `/categories/${parent.slug}` },
            ...childCategories(categories, parent.slug).map((c) => ({
              label: c.name,
              href: `/categories/${c.slug}`,
              active: c.slug === slug,
            })),
          ]
        : [];

  return (
    <div className="container-page">
      <JsonLd data={breadcrumbLd(siteUrl(), categoryCrumbs(path))} />
      <CollectionHeader
        eyebrow={parent ? parent.name : "Collection"}
        title={`${category.name}.`}
        breadcrumbs={<Breadcrumbs path={path} currentId={category.id} />}
        links={chips}
      />
      <ListingPage category={slug} searchParams={query} />
    </div>
  );
}
