import Link from "next/link";
import type { Category } from "@repo/types";

/** Shop / root / … / category. With currentId, that crumb isn't a link. */
export function Breadcrumbs({
  path,
  currentId,
}: {
  path: Pick<Category, "id" | "name" | "slug">[];
  currentId?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link href="/shop" className="link-underline hover:text-foreground">
            Shop
          </Link>
        </li>
        {path.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-2 before:h-px before:w-3 before:bg-border"
          >
            {c.id === currentId ? (
              <span aria-current="page" className="text-foreground">
                {c.name}
              </span>
            ) : (
              <Link
                href={`/categories/${c.slug}`}
                className="link-underline hover:text-foreground"
              >
                {c.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
