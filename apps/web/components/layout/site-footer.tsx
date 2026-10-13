import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { site } from "@/lib/site";
import { getCollections } from "@/modules/catalog/api";

const signedOutLinks = [
  { label: "Sign in", href: "/auth/login" },
  { label: "Create account", href: "/auth/register" },
];

const signedInLinks = [
  { label: "Your account", href: "/account" },
  { label: "Orders", href: "/account/orders" },
  { label: "Wishlist", href: "/account/wishlist" },
  { label: "Your bag", href: "/cart" },
];

export async function SiteFooter() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const [roots, user] = await Promise.all([
    getCollections().catch(() => []),
    getSessionUser(),
  ]);
  const columns = [
    {
      title: "Shop",
      links: [
        { label: "Shop all", href: "/shop" },
        ...roots.map((c) => ({ label: c.name, href: `/categories/${c.slug}` })),
        { label: "Editor's picks", href: "/shop?featured=true" },
      ],
    },
    { title: "Account", links: user ? signedInLinks : signedOutLinks },
  ];

  return (
    <footer className="mt-24 border-t border-border bg-secondary/40">
      <div className="container-page grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm space-y-4">
          <p className="display text-3xl">{site.tagline}.</p>
          <p className="text-sm text-muted-foreground">{site.description}</p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <p className="eyebrow mb-4">{column.title}</p>
            <ul className="space-y-2.5 text-[0.8125rem]">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="link-underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="container-page overflow-hidden">
        {/* The oversized wordmark, cropped by the page edge. */}
        <p
          aria-hidden
          className="font-serif text-[clamp(5rem,22vw,22rem)] leading-[0.75] tracking-[-0.04em] text-foreground/[0.07] select-none"
        >
          {site.name}
        </p>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-5 text-xs text-muted-foreground">
          <span>
            © {new Date().getUTCFullYear()} {site.name}. A demo store.
          </span>
          {apiUrl && (
            <a
              className="link-underline"
              href={`${apiUrl}/api/v1/docs/`}
              target="_blank"
              rel="noreferrer"
            >
              API docs
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
