import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { absoluteUrl, indexable } from "@/lib/site-url";

// Signed-in and transactional pages: nothing for a search engine there.
// They also carry noindex, for links that reach them anyway.
const PRIVATE = [
  "/admin",
  "/account",
  "/cart",
  "/checkout",
  "/auth",
  "/session",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Per request, so the deployment's env decides, not the build's.
  await connection();
  if (!indexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
