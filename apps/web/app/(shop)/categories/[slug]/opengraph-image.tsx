import { cloudinaryJpeg } from "@/lib/cloudinary";
import { site } from "@/lib/site";
import { getCategories, getListing } from "@/modules/catalog/api";
import { categoryPath } from "@/modules/catalog/lib/category-tree";
import { DEFAULT_FILTERS } from "@/modules/catalog/lib/filters";
import {
  brandImage,
  SHARE_SIZE,
  SHARE_TYPE,
  shareImage,
} from "@/modules/seo/share-card";

export const alt = `A collection at ${site.name}`;
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Like the landing tiles: the newest product's photo is the cover.
  const [categories, listing] = await Promise.all([
    getCategories().catch(() => []),
    getListing(slug, DEFAULT_FILTERS).catch(() => null),
  ]);
  const path = categoryPath(categories, slug);
  const category = path.at(-1);
  if (!category || !listing) return brandImage();

  const total = listing.meta.total;
  const cover = listing.data.products[0]?.images[0];
  return shareImage({
    eyebrow: path.at(-2)?.name ?? "Collection",
    title: category.name,
    detail: `${total} ${total === 1 ? "piece" : "pieces"}`,
    image: cover ? cloudinaryJpeg(cover, 504, 630) : null,
  });
}
