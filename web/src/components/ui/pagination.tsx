import { ChevronLeft, ChevronRight } from "@/components/icons";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  noun = "results",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  noun?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted-foreground">
      <p className="tabular-nums">
        {from}–{to} of {total} {noun}
      </p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <span className="px-2 tabular-nums">
            {page} / {pageCount}
          </span>
          <Button variant="outline" size="icon" onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
