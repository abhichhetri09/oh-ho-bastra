import type { AdminListProductsData } from "@repo/api-client";
import type { ProductSort, SortDir } from "@repo/types";

export type ProductStatus = "active" | "inactive";

/** The admin products table's state, mirrored in its URL. */
export type AdminProductFilters = {
  page: number;
  q: string;
  status: ProductStatus | "";
  category: string;
  /** "" is the default order (newest first). */
  sort: ProductSort | "";
  dir: SortDir;
};

const PRODUCT_SORTS: ProductSort[] = [
  "created",
  "updated",
  "name",
  "price",
  "stock",
];

export const EMPTY_FILTERS: AdminProductFilters = {
  page: 1,
  q: "",
  status: "",
  category: "",
  sort: "",
  dir: "desc",
};

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Reads the filters from page search params; junk falls back to defaults. */
export function parseAdminProductFilters(params: Params): AdminProductFilters {
  const page = Number(first(params.page));
  const status = first(params.status);
  const sort = first(params.sort) as ProductSort;
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    q: first(params.q).slice(0, 100),
    status: status === "active" || status === "inactive" ? status : "",
    category: first(params.category),
    ...(PRODUCT_SORTS.includes(sort)
      ? { sort, dir: first(params.dir) === "asc" ? "asc" : "desc" }
      : { sort: "", dir: "desc" }),
  };
}

/** The API query, without empty values. */
export function adminProductsQuery(
  f: AdminProductFilters,
): NonNullable<AdminListProductsData["query"]> {
  return {
    page: f.page,
    ...(f.q && { q: f.q }),
    ...(f.status && { status: f.status }),
    ...(f.category && { category: f.category }),
    ...(f.sort && { sort: f.sort, dir: f.dir }),
  };
}

/** "?q=linen&page=2", or "" for the defaults. */
export function adminProductsSearch(f: AdminProductFilters): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.status) params.set("status", f.status);
  if (f.category) params.set("category", f.category);
  if (f.sort) {
    params.set("sort", f.sort);
    params.set("dir", f.dir);
  }
  if (f.page > 1) params.set("page", String(f.page));
  const search = params.toString();
  return search ? `?${search}` : "";
}

/**
 * The page links to show: the first, the last and a window around the
 * current page, with null for each gap. (5, 10) → [1, null, 4, 5, 6, null, 10].
 * A gap of a single page shows that page instead of an ellipsis.
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  const near = (p: number) => Math.abs(p - current) <= 1;
  const pages: (number | null)[] = [];
  for (let p = 1; p <= total; p++) {
    const lone = (p === 2 && near(3)) || (p === total - 1 && near(total - 2));
    if (p === 1 || p === total || near(p) || lone) {
      pages.push(p);
    } else if (pages.at(-1) !== null) {
      pages.push(null);
    }
  }
  return pages;
}
