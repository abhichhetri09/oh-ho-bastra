import { Link } from "react-router-dom";

import { ChevronRight } from "@/components/icons";

export function Breadcrumb({
  items,
}: {
  items: { label: string; to?: string }[];
}) {
  return (
    <nav className="flex flex-wrap items-center text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center">
          {index > 0 ? (
            <ChevronRight className="mx-1.5 size-3 opacity-50" aria-hidden />
          ) : null}
          {item.to ? (
            <Link to={item.to} className="hover:text-foreground">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
