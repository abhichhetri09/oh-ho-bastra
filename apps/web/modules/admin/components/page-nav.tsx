"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { pageWindow } from "../lib/filters";

/**
 * Page-number links. Each is a real link (it opens in a new tab), and a
 * plain click is handled in place by `onPage`.
 */
export function PageNav({
  page,
  totalPages,
  href,
  onPage,
}: {
  page: number;
  totalPages: number;
  href: (page: number) => string;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const link = (p: number) => ({
    href: href(p),
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      onPage(p);
    },
  });

  return (
    <Pagination className="mx-0 w-auto justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            {...link(page - 1)}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-40" : undefined}
            tabIndex={page <= 1 ? -1 : undefined}
          />
        </PaginationItem>
        {pageWindow(page, totalPages).map((p, i) => (
          <PaginationItem key={p ?? `gap-${i}`}>
            {p === null ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink {...link(p)} isActive={p === page}>
                {p}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            {...link(page + 1)}
            aria-disabled={page >= totalPages}
            className={
              page >= totalPages ? "pointer-events-none opacity-40" : undefined
            }
            tabIndex={page >= totalPages ? -1 : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
