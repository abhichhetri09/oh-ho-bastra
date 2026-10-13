import type { StatsRange } from "@repo/types";
import type { AdminProductFilters } from "./lib/filters";
import type {
  AdminCustomerFilters,
  AdminEmailFilters,
  AdminInventoryFilters,
  AdminOrderFilters,
  AdminReviewFilters,
} from "./lib/order-filters";

// Admin data is the same for every admin, so the keys carry no user id.
export const adminKeys = {
  all: ["admin"] as const,
  stats: (range?: StatsRange) =>
    range
      ? ([...adminKeys.all, "stats", range] as const)
      : ([...adminKeys.all, "stats"] as const),
  products: () => [...adminKeys.all, "products"] as const,
  productLists: () => [...adminKeys.products(), "list"] as const,
  productList: (filters: AdminProductFilters) =>
    [...adminKeys.productLists(), filters] as const,
  product: (id: string) => [...adminKeys.products(), "detail", id] as const,
  variants: (productId: string) =>
    [...adminKeys.products(), "variants", productId] as const,
  categories: () => [...adminKeys.all, "categories"] as const,
  orders: () => [...adminKeys.all, "orders"] as const,
  orderList: (filters: AdminOrderFilters) =>
    [...adminKeys.orders(), "list", filters] as const,
  order: (number: number) => [...adminKeys.orders(), "detail", number] as const,
  counts: () => [...adminKeys.all, "counts"] as const,
  search: (q: string) => [...adminKeys.all, "search", q] as const,
  inventory: () => [...adminKeys.all, "inventory"] as const,
  inventoryList: (filters: AdminInventoryFilters) =>
    [...adminKeys.inventory(), filters] as const,
  emails: () => [...adminKeys.all, "emails"] as const,
  emailList: (filters: AdminEmailFilters) =>
    [...adminKeys.emails(), filters] as const,
  customers: () => [...adminKeys.all, "customers"] as const,
  customerList: (filters: AdminCustomerFilters) =>
    [...adminKeys.customers(), "list", filters] as const,
  customer: (id: string) => [...adminKeys.customers(), "detail", id] as const,
  reviews: () => [...adminKeys.all, "reviews"] as const,
  reviewList: (filters: AdminReviewFilters) =>
    [...adminKeys.reviews(), "list", filters] as const,
};
