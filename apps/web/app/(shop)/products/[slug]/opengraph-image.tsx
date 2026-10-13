import { cloudinaryJpeg } from "@/lib/cloudinary";
import { formatPriceShort } from "@/lib/money";
import { site } from "@/lib/site";
import { getCategories, getProductPage } from "@/modules/catalog/api";
import {
  brandImage,
  SHARE_SIZE,
  SHARE_TYPE,
  shareImage,
} from "@/modules/seo/share-card";

export const alt = `A product at ${site.name}`;
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // A link preview should never be an error: anything missing or failing
  // falls back to the brand card.
  const [page, categories] = await Promise.all([
    getProductPage(slug).catch(() => null),
    getCategories().catch(() => []),
  ]);
  if (!page) return brandImage();

  const { product_detail: product } = page;
  const category = categories.find((c) => c.id === product.category_id);
  const onOffer =
    product.offer_price !== null && product.offer_price < product.selling_price;
  const image = product.images[0];
  return shareImage({
    eyebrow: category?.name,
    title: product.name,
    detail: formatPriceShort(product.price),
    was: onOffer ? formatPriceShort(product.selling_price) : undefined,
    image: image ? cloudinaryJpeg(image, 504, 630) : null,
  });
}
