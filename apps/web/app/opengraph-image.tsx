import { site } from "@/lib/site";
import { brandImage, SHARE_SIZE, SHARE_TYPE } from "@/modules/seo/share-card";

// The share image for every page without its own (products and
// collections have theirs). Built once at build time.
export const alt = `${site.name}: ${site.tagline}`;
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function Image() {
  return brandImage();
}
