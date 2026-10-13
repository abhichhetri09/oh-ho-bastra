import "server-only";

/**
 * The storefront's public origin, for canonical URLs, the sitemap and share
 * images. FRONTEND_URL is the same variable the API uses for Stripe return
 * URLs. On Vercel without it, the production domain Vercel assigns.
 * Read per request, so a build without it doesn't bake in localhost.
 */
export function siteUrl(): string {
  const configured =
    process.env.FRONTEND_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return (configured || "http://localhost:3000").replace(/\/+$/, "");
}

/** An absolute URL on the storefront: absoluteUrl("/shop"). */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Whether search engines should index this deployment. Vercel preview
 * deployments stay out, so a preview URL never competes with the real site.
 */
export function indexable(): boolean {
  const env = process.env.VERCEL_ENV;
  return !env || env === "production";
}
