import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { site } from "@/lib/site";
import { storeBusiness } from "@/lib/theme-server";
import { getCollections } from "@/modules/catalog/api";

const signedOutLinks = [
  { label: "Sign in", href: "/auth/login" },
  { label: "Create account", href: "/auth/register" },
];

const helpLinks = [
  { label: "Contact", href: "/contact" },
  { label: "Shipping", href: "/terms#shipping" },
  { label: "Returns", href: "/terms#returns" },
  { label: "Terms of sale", href: "/terms" },
  { label: "Privacy policy", href: "/privacy" },
];

const signedInLinks = [
  { label: "Your account", href: "/account" },
  { label: "Orders", href: "/account/orders" },
  { label: "Wishlist", href: "/account/wishlist" },
  { label: "Your bag", href: "/cart" },
];

export async function SiteFooter() {
  const [roots, user, business] = await Promise.all([
    getCollections().catch(() => []),
    getSessionUser(),
    storeBusiness(),
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
    { title: "Help", links: helpLinks },
    { title: "Account", links: user ? signedInLinks : signedOutLinks },
  ];

  return (
    <footer className="mt-24 border-t border-border bg-secondary/40">
      <div className="container-page grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
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

      <div className="container-page overflow-hidden pb-6">
        {/* The wordmark, one line, scaled to the page width. */}
        <p
          aria-hidden
          className="font-serif text-[clamp(3rem,10vw,9rem)] leading-[0.85] tracking-[-0.03em] whitespace-nowrap text-foreground/[0.08] select-none"
        >
          {site.name}
        </p>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-5 text-xs text-muted-foreground">
          <span>
            © {new Date().getUTCFullYear()} {site.name}
            {business.business_name && business.business_name !== site.name
              ? ` · ${business.business_name}`
              : ""}
            {business.business_id ? ` · Y-tunnus ${business.business_id}` : ""}
          </span>
        </div>
      </div>
    </footer>
  );
}
