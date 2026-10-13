/** A top-level header entry: "shop", "featured", or a root category's slug. */
export type NavSection = string;

/**
 * Which header entry the current page belongs to, if any. A category page
 * marks its root (Home for /categories/decor); /shop?featured=true is
 * Editor's picks, the rest of /shop is Shop all.
 */
export function activeNav(
  pathname: string,
  featured: boolean,
  categories: ReadonlyArray<{ slug: string; children: { slug: string }[] }>,
): NavSection | null {
  if (pathname === "/shop") return featured ? "featured" : "shop";
  const slug = /^\/categories\/([^/]+)/.exec(pathname)?.[1];
  if (!slug) return null;
  const root = categories.find(
    (c) => c.slug === slug || c.children.some((child) => child.slug === slug),
  );
  return root?.slug ?? null;
}
