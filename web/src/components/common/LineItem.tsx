import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ProductImage } from "@/components/common/ProductImage";
import type { Swatch } from "@/features/catalog/types";
import { cn } from "@/lib/utils";

const thumbSizes = {
  sm: "h-14 w-12",
  md: "h-20 w-16",
  lg: "h-24 w-20 sm:h-28 sm:w-24",
};

/** A product row: photo thumbnail, title, meta line, trailing value, optional actions. */
export function LineItem({
  title,
  href,
  meta,
  trailing,
  image,
  swatch,
  size = "md",
  children,
  className,
}: {
  title: string;
  href?: string;
  meta?: ReactNode;
  trailing?: ReactNode;
  image?: string | null;
  swatch?: Swatch | null;
  size?: keyof typeof thumbSizes;
  children?: ReactNode;
  className?: string;
}) {
  const thumb = (
    <ProductImage src={image} alt={title} swatch={swatch} className={cn("shrink-0 rounded-md", thumbSizes[size])} />
  );
  return (
    <li className={cn("flex items-center gap-4", className)}>
      {href ? <Link to={href} className="shrink-0">{thumb}</Link> : thumb}
      <div className="min-w-0 flex-1">
        {href ? (
          <Link
            to={href}
            className={cn(
              "font-medium hover:underline",
              size !== "sm" && "font-serif text-lg tracking-tight",
            )}
          >
            {title}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium">{title}</p>
        )}
        {meta ? <p className="mt-1 text-sm text-muted-foreground">{meta}</p> : null}
        {children}
      </div>
      {trailing ? <div className="shrink-0 text-sm tabular-nums">{trailing}</div> : null}
    </li>
  );
}
