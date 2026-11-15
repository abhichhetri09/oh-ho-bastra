import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

// Set by the dev container (docker-compose.dev.yml): a soft memory target
// for Turbopack, in MB. Unset everywhere else.
const turbopackMemoryMb = Number(process.env.TURBOPACK_MEMORY_LIMIT_MB);

// Set by the production image (apps/web/Dockerfile): a self-contained
// server in .next/standalone, traced from the repo root so the workspace
// packages are included. Unset on Vercel, which does its own bundling.
const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  // The dev container builds into its own directory: its volume mountpoint
  // is created by Docker as root, which would block host builds of .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  ...(standalone && {
    output: "standalone",
    outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  }),
  async redirects() {
    return [
      // Store details and delivery moved from their own page into Settings.
      {
        source: "/admin/business",
        destination: "/admin/settings/store",
        permanent: true,
      },
    ];
  },
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
      // The on-disk cache lives in the container's .next-docker volume, so
      // it survives restarts and grew past 2GB. Loading it pushed the dev
      // server into the container's memory cap within seconds of starting,
      // and it exited, restarted and 404'd in a loop.
      turbopackFileSystemCacheForDev: false,
    }),
  },
};

// Uploads source maps to Sentry (so stack traces show the real files and
// lines) only when SENTRY_AUTH_TOKEN is set, i.e. in the deploy build.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_WEB,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  telemetry: false,
  silent: !process.env.CI,
});
