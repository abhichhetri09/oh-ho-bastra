import { Link } from "react-router-dom";

import { Bag, Mail, type LucideIcon } from "@/components/icons";
import { Logo } from "@/components/layout/Logo";
import { useCollections } from "@/features/catalog/api";

type FooterLink = { to: string; label: string; icon?: LucideIcon };

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-white">{title}</p>
      {links.map(({ to, label, icon: Icon }) => (
        <Link key={to} to={to} className="flex items-center gap-2 hover:text-white">
          {Icon ? <Icon className="size-3.5" strokeWidth={1.5} aria-hidden /> : null}
          {label}
        </Link>
      ))}
    </div>
  );
}

const shopPages: FooterLink[] = [
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact", icon: Mail },
  { to: "/cart", label: "Bag", icon: Bag },
];

export function SiteFooter() {
  const { data: collections = [] } = useCollections();
  const collectionLinks = collections.map((c) => ({ to: `/collections/${c.slug}`, label: c.name }));

  return (
    <footer className="bg-black px-6 py-14 text-sm text-white/60 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 sm:flex-row sm:justify-between">
        <div className="max-w-xs space-y-4">
          <Logo mark className="h-9" />
          <p className="font-serif text-xl font-medium text-white">Tees and custom prints.</p>
        </div>
        <div className="grid grid-cols-2 gap-12">
          <FooterColumn title="Shop" links={collectionLinks} />
          <FooterColumn title="The shop" links={shopPages} />
        </div>
      </div>
    </footer>
  );
}
