import type { ImageLoaderProps } from "next/image";
import { withTransformation } from "@/lib/cloudinary";

// next/image loader for Cloudinary (next.config.ts: images.loaderFile).
// Cloudinary resizes and picks the format (AVIF/WebP) at its edge, so Next's
// own optimizer is skipped. The resize runs after any crop in the URL.

export default function cloudinaryLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  // Local files (public/editorial) are served as they are; the width only
  // keeps next/image's srcset entries distinct.
  if (src.startsWith("/")) return `${src}?w=${width}`;
  // c_limit never upscales a small original.
  return withTransformation(
    src,
    `f_auto,q_${quality ?? "auto"},c_limit,w_${width}`,
  );
}
