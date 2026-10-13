import Link from "next/link";

/** The editorial header of a listing: kicker, big serif title, link chips. */
export function CollectionHeader({
  eyebrow,
  title,
  description,
  links = [],
  breadcrumbs,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  links?: { label: string; href: string; active?: boolean }[];
  breadcrumbs?: React.ReactNode;
}) {
  return (
    <header className="space-y-6 pt-8 pb-10 sm:pt-14 sm:pb-12">
      {breadcrumbs}
      <div className="grid items-end gap-6 lg:grid-cols-[1fr_minmax(0,26rem)]">
        <div className="space-y-4">
          <p className="eyebrow animate-rise">{eyebrow}</p>
          <h1
            className="display animate-rise text-[clamp(3.25rem,7vw,6.5rem)]"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            {title}
          </h1>
        </div>
        {description && (
          <p
            className="animate-rise text-sm leading-relaxed text-muted-foreground lg:pb-3"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            {description}
          </p>
        )}
      </div>
      {links.length > 0 && (
        <nav
          aria-label="Collections"
          className="no-scrollbar -mx-4 overflow-x-auto px-4"
        >
          <ul className="flex w-max gap-2">
            {links.map((link, i) => (
              <li
                key={link.href}
                className="animate-rise"
                style={{ "--i": i + 3 } as React.CSSProperties}
              >
                <Link
                  href={link.href}
                  aria-current={link.active ? "page" : undefined}
                  className="inline-flex h-9 items-center rounded-full border border-border px-4 text-[0.8125rem] transition-colors duration-300 hover:border-foreground aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
