import type {
  CustomerSort,
  EmailStatus,
  OrderSort,
  SortDir,
  OrderStatus,
  ReviewStatus,
  StockLevel,
} from "@repo/types";

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function pageOf(params: Params): number {
  const page = Number(first(params.page));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** A table's sort: a field and a direction ("" field: the default order). */
export type TableSort<F extends string> = { sort: F | ""; dir: SortDir };

function sortOf<F extends string>(
  params: Params,
  fields: readonly F[],
): TableSort<F> {
  const sort = first(params.sort) as F;
  const dir = first(params.dir);
  return fields.includes(sort)
    ? { sort, dir: dir === "asc" ? "asc" : "desc" }
    : { sort: "", dir: "desc" };
}

function searchOf(entries: [string, string | number | undefined][]): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (
      value !== undefined &&
      value !== "" &&
      !(key === "page" && value === 1)
    ) {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ORDER_SORTS: OrderSort[] = ["created", "total"];

/** The admin orders table's state, mirrored in its URL. */
export type AdminOrderFilters = {
  page: number;
  q: string;
  status: OrderStatus | "";
  /** A customer's user ID, or "" for everyone. */
  customer: string;
  /** Placed dates, YYYY-MM-DD (UTC, both included), or "". */
  from: string;
  to: string;
} & TableSort<OrderSort>;

export const EMPTY_ORDER_FILTERS: AdminOrderFilters = {
  page: 1,
  q: "",
  status: "",
  customer: "",
  from: "",
  to: "",
  sort: "",
  dir: "desc",
};

export function parseAdminOrderFilters(params: Params): AdminOrderFilters {
  const status = first(params.status) as OrderStatus;
  const customer = first(params.customer);
  const from = first(params.from);
  const to = first(params.to);
  return {
    page: pageOf(params),
    q: first(params.q).slice(0, 100),
    status: ORDER_STATUSES.includes(status) ? status : "",
    customer: UUID.test(customer) ? customer.toLowerCase() : "",
    from: DATE.test(from) ? from : "",
    to: DATE.test(to) ? to : "",
    ...sortOf(params, ORDER_SORTS),
  };
}

/** The filters without the page: what the CSV export takes. */
export function adminOrdersExportQuery(f: AdminOrderFilters) {
  return {
    ...(f.q && { q: f.q }),
    ...(f.status && { status: f.status }),
    ...(f.customer && { customer: f.customer }),
    ...(f.from && { from: f.from }),
    ...(f.to && { to: f.to }),
    ...(f.sort && { sort: f.sort, dir: f.dir }),
  };
}

export function adminOrdersQuery(f: AdminOrderFilters) {
  return { page: f.page, ...adminOrdersExportQuery(f) };
}

export function adminOrdersSearch(f: AdminOrderFilters): string {
  return searchOf([
    ["customer", f.customer],
    ["status", f.status],
    ["q", f.q],
    ["from", f.from],
    ["to", f.to],
    ["sort", f.sort],
    ["dir", f.sort ? f.dir : ""],
    ["page", f.page],
  ]);
}

const CUSTOMER_SORTS: CustomerSort[] = ["joined", "orders", "spend"];

/** The customers table's state, mirrored in its URL. */
export type AdminCustomerFilters = {
  page: number;
  q: string;
} & TableSort<CustomerSort>;

export function parseAdminCustomerFilters(
  params: Params,
): AdminCustomerFilters {
  return {
    page: pageOf(params),
    q: first(params.q).slice(0, 100),
    ...sortOf(params, CUSTOMER_SORTS),
  };
}

export function adminCustomersQuery(f: AdminCustomerFilters) {
  return {
    page: f.page,
    ...(f.q && { q: f.q }),
    ...(f.sort && { sort: f.sort, dir: f.dir }),
  };
}

export function adminCustomersSearch(f: AdminCustomerFilters): string {
  return searchOf([
    ["q", f.q],
    ["sort", f.sort],
    ["dir", f.sort ? f.dir : ""],
    ["page", f.page],
  ]);
}

/** The moderation list's state, mirrored in its URL. */
export type AdminReviewFilters = {
  page: number;
  status: ReviewStatus | "";
  rating: number | null;
};

export function parseAdminReviewFilters(params: Params): AdminReviewFilters {
  const status = first(params.status);
  const rating = Number(first(params.rating));
  return {
    page: pageOf(params),
    status: status === "published" || status === "hidden" ? status : "",
    rating:
      Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
  };
}

export function adminReviewsQuery(f: AdminReviewFilters) {
  return {
    page: f.page,
    ...(f.status && { status: f.status }),
    ...(f.rating !== null && { rating: f.rating }),
  };
}

export function adminReviewsSearch(f: AdminReviewFilters): string {
  return searchOf([
    ["status", f.status],
    ["rating", f.rating ?? undefined],
    ["page", f.page],
  ]);
}

const STOCK_LEVELS: StockLevel[] = ["out", "low", "in"];

/** The inventory table's state, mirrored in its URL. */
export type AdminInventoryFilters = {
  page: number;
  q: string;
  stock: StockLevel | "";
  category: string;
  /** Hidden variants and products too. */
  hidden: boolean;
};

export function parseAdminInventoryFilters(
  params: Params,
): AdminInventoryFilters {
  const stock = first(params.stock) as StockLevel;
  return {
    page: pageOf(params),
    q: first(params.q).slice(0, 100),
    stock: STOCK_LEVELS.includes(stock) ? stock : "",
    category: first(params.category),
    hidden: first(params.hidden) === "true",
  };
}

export function adminInventoryQuery(f: AdminInventoryFilters) {
  return {
    page: f.page,
    ...(f.q && { q: f.q }),
    ...(f.stock && { stock: f.stock }),
    ...(f.category && { category: f.category }),
    ...(f.hidden && { hidden: true }),
  };
}

export function adminInventorySearch(f: AdminInventoryFilters): string {
  return searchOf([
    ["stock", f.stock],
    ["q", f.q],
    ["category", f.category],
    ["hidden", f.hidden ? "true" : ""],
    ["page", f.page],
  ]);
}

const EMAIL_STATUSES: EmailStatus[] = ["pending", "sent", "failed"];

/** The email outbox list's state, mirrored in its URL. */
export type AdminEmailFilters = { page: number; status: EmailStatus | "" };

export function parseAdminEmailFilters(params: Params): AdminEmailFilters {
  const status = first(params.status) as EmailStatus;
  return {
    page: pageOf(params),
    status: EMAIL_STATUSES.includes(status) ? status : "",
  };
}

export function adminEmailsQuery(f: AdminEmailFilters) {
  return { page: f.page, ...(f.status && { status: f.status }) };
}

export function adminEmailsSearch(f: AdminEmailFilters): string {
  return searchOf([
    ["status", f.status],
    ["page", f.page],
  ]);
}
