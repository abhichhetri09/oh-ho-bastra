import type { NextConfig } from "next";

// Set by the dev container (docker-compose.dev.yml): a soft memory target
// for Turbopack, in MB. Unset everywhere else.
const turbopackMemoryMb = Number(process.env.TURBOPACK_MEMORY_LIMIT_MB);

const nextConfig: NextConfig = {
  // The dev container builds into its own directory: its volume mountpoint
  // is created by Docker as root, which would block host builds of .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    // Product images are Cloudinary uploads, resized and converted by
    // Cloudinary itself (lib/image-loader.ts), so Next's optimizer is unused.
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",
  },
  experimental: {
    // The default scroll handler looks for the new page's first DOM node,
    // which can be a tag React hoisted into <head>; it then gives up, so a
    // product opened from far down /shop kept the old scroll position. This
    // one measures the segment's own nodes (Next 16's suggested fix).
    appNewScrollHandler: true,
    ...(turbopackMemoryMb > 0 && {
      turbopackMemoryLimit: turbopackMemoryMb * 1024 * 1024,
    }),
  },
};

export default nextConfig;
