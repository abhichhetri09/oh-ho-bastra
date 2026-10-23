import { z } from "zod";
import type { Request, Response } from "express";
import {
  AnnouncementsBodySchema,
  RefundOrderBodySchema,
  ShipOrderBodySchema,
  StoreThemeSchema,
} from "@repo/types";
import { exportCsv } from "../admin/csv";
import {
  orderFilters,
  orderNumber,
  pathNumber,
  runeCount,
  searchQuery,
  trimSpace,
  MAX_SEARCH,
} from "../admin/filters";
import { respondOrder } from "../admin/order-detail";
import {
  DEFAULT_STATS_RANGE,
  LOW_STOCK_THRESHOLD,
  periods,
  STATS_RANGES,
  statusCounts,
  type Period,
} from "../admin/stats";
import {
  adminAttention,
  adminCustomerCount,
  adminCustomerReviews,
  adminExportOrders,
  adminGetCustomer,
  adminGetOrder,
  adminInventory,
  adminInventoryCounts,
  adminListCustomers,
  adminListOrders,
  adminLowStock,
  adminNewCustomers,
  adminOrdersByStatus,
  adminPeriodTotals,
  adminRecentOrders,
  adminRecentReviews,
  adminSalesByDay,
  adminSearchProducts,
  adminTopProducts,
  countAdminCustomers,
  countAdminOrders,
  listAddresses,
  updateAnnouncements,
  updateStoreTheme,
} from "../db/gen";
import type { Order } from "../db/gen";
import type { Queryable } from "../db/queryable";
import type { Deps } from "../deps";
import { requireAuth, requireRole } from "../http/middleware";
import {
  checkPageInRange,
  offset,
  parsePage,
  parseSort,
  pathUuid,
  query,
} from "../http/params";
import { Refusal } from "../checkout/refusal";
import { fail, internal, ok, paginationMeta } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";
import { containsPattern } from "../lib/text";

// The admin dashboard, orders, customers, inventory and settings
// (internal/handlers/admin, routes/admin.go).

const ORDERS_PAGE_SIZE = 20;
const CUSTOMERS_PAGE_SIZE = 20;
const INVENTORY_PAGE_SIZE = 25;
/** searchLimit is how many of each kind the command palette shows. */
const SEARCH_LIMIT = 5;
/** maxExportRows caps one CSV export; narrow the dates for more. */
const MAX_EXPORT_ROWS = 10_000;

/** customerSorts are the sortable fields and their natural direction. */
const CUSTOMER_SORTS = {
  joined: "desc",
  orders: "desc",
  spend: "desc",
} as const;

const STOCK_LEVELS = ["out", "low", "in"];

/**
 * Go trimmed the theme and checked required before oneof, so a blank theme
 * is "Theme is required" and a number "Theme must be a string".
 */
const ThemeBody = z.object({
  theme: z.string().trim().min(1).pipe(StoreThemeSchema),
});

/** A :one row that can't be missing (an aggregate); Go's ErrNoRows was a 500. */
function must<T>(row: T | null): T {
  if (row === null) throw new Error("no rows in result set");
  return row;
}

/** Totals are one period's sales and sign-ups. */
async function totals(db: Queryable, p: Period) {
  const range = { from_time: p.from, to_time: p.to };
  const [sales, customers] = await Promise.all([
    adminPeriodTotals(db, range),
    adminNewCustomers(db, range),
  ]);
  const { revenue, orders } = must(sales);
  return {
    revenue,
    orders,
    average_order_value: orders > 0 ? Math.trunc(revenue / orders) : 0,
    new_customers: must(customers).count,
  };
}

export function adminRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;
  const admin = api.group("/admin", requireAuth(cfg), requireRole("admin"));

  /**
   * GetStats is the dashboard for ?range= (7d, 30d or 90d; 30d by default):
   * sales and sign-ups against the period before, sales by day, best sellers,
   * orders by status, what needs attention, and the latest orders and reviews.
   * Sales are paid, shipped or delivered orders, dated by payment.
   */
  admin.get("/stats", async (req, res) => {
    const range =
      req.query.range === undefined ? DEFAULT_STATS_RANGE : query(req, "range");
    const days = Object.hasOwn(STATS_RANGES, range)
      ? STATS_RANGES[range]
      : undefined;
    if (days === undefined) {
      fail(res, 400, "INVALID_QUERY_PARAMETER", "range must be 7d, 30d or 90d");
      return;
    }
    const { current, previous } = periods(new Date(), days);
    const bounds = { from_time: current.from, to_time: current.to };
    const [
      cur,
      prev,
      customers,
      series,
      byStatus,
      topProducts,
      attention,
      lowStock,
      recentOrders,
      recentReviews,
    ] = await Promise.all([
      totals(db, current),
      totals(db, previous),
      adminCustomerCount(db),
      adminSalesByDay(db, days),
      adminOrdersByStatus(db),
      adminTopProducts(db, bounds),
      adminAttention(db),
      adminLowStock(db, LOW_STOCK_THRESHOLD),
      adminRecentOrders(db),
      adminRecentReviews(db),
    ]);
    ok(res, 200, "Stats fetched", {
      range,
      current: cur,
      previous: prev,
      customers: must(customers).count,
      series,
      orders_by_status: statusCounts(byStatus),
      top_products: topProducts,
      needs_attention: must(attention),
      low_stock: lowStock,
      recent_orders: recentOrders,
      recent_reviews: recentReviews,
    });
  });

  /**
   * GetCounts is what's waiting: orders by status, paid orders short of
   * stock, failed emails and sold-out variants.
   */
  admin.get("/counts", async (_req, res) => {
    const [byStatus, attention] = await Promise.all([
      adminOrdersByStatus(db),
      adminAttention(db).then(must),
    ]);
    ok(res, 200, "Counts fetched", {
      orders_by_status: statusCounts(byStatus),
      ...attention,
    });
  });

  /**
   * Search finds orders (by number, or a piece of the email), products (by
   * name or SKU, hidden ones too) and customers (by name or email), up to 5
   * of each, for the command palette.
   */
  admin.get("/search", async (req, res) => {
    const q = trimSpace(query(req, "q"));
    if (q === "" || runeCount(q) > MAX_SEARCH) {
      fail(
        res,
        400,
        "INVALID_QUERY_PARAMETER",
        "q must be 1 to 100 characters",
      );
      return;
    }
    const pattern = containsPattern(q);
    const number = orderNumber(q);
    const [orders, products, customers] = await Promise.all([
      adminListOrders(db, {
        status: null,
        number,
        email_pattern: number === null ? pattern : null,
        user_id: null,
        from_date: null,
        to_date: null,
        sort: "",
        dir: "",
        page_offset: 0,
        page_limit: SEARCH_LIMIT,
      }),
      adminSearchProducts(db, pattern),
      adminListCustomers(db, {
        pattern,
        sort: "",
        dir: "",
        page_offset: 0,
        page_limit: SEARCH_LIMIT,
      }),
    ]);
    ok(res, 200, "Search done", { orders, products, customers });
  });

  /**
   * ListInventory is every variant on sale (hidden ones with hidden=true),
   * lowest stock first, filtered by a piece of the product name or SKU, a
   * category with its subcategories and a stock level.
   */
  admin.get("/inventory", async (req, res) => {
    const page = parsePage(req, res);
    if (page === null) return;
    const q = searchQuery(req, res);
    if (q === null) return;
    const pattern = q !== "" ? containsPattern(q) : null;
    const category = query(req, "category") || null;
    let stock: string | null = query(req, "stock");
    if (stock === "") stock = null;
    else if (!STOCK_LEVELS.includes(stock)) {
      fail(res, 400, "INVALID_QUERY_PARAMETER", "stock must be out, low or in");
      return;
    }
    const hiddenParam = query(req, "hidden");
    if (
      hiddenParam !== "" &&
      hiddenParam !== "false" &&
      hiddenParam !== "true"
    ) {
      fail(res, 400, "INVALID_QUERY_PARAMETER", "hidden must be true or false");
      return;
    }
    const hidden = hiddenParam === "true";

    const counts = must(
      await adminInventoryCounts(db, {
        pattern,
        category_slug: category,
        include_hidden: hidden,
        low_threshold: LOW_STOCK_THRESHOLD,
      }),
    );
    const total =
      stock === "out"
        ? counts.out_of_stock
        : stock === "low"
          ? counts.low
          : stock === "in"
            ? counts.in_stock
            : counts.out_of_stock + counts.low + counts.in_stock;
    if (!checkPageInRange(res, page, total, INVENTORY_PAGE_SIZE)) return;
    const rows =
      total > 0
        ? await adminInventory(db, {
            pattern,
            category_slug: category,
            include_hidden: hidden,
            stock,
            low_threshold: LOW_STOCK_THRESHOLD,
            page_limit: INVENTORY_PAGE_SIZE,
            page_offset: offset(page, INVENTORY_PAGE_SIZE),
          })
        : [];
    ok(
      res,
      200,
      "Inventory fetched",
      { rows, counts },
      paginationMeta(total, page, INVENTORY_PAGE_SIZE),
    );
  });

  /**
   * ListOrders is every order, newest first unless sorted otherwise, filtered
   * as orderFilters reads.
   */
  admin.get("/orders", async (req, res) => {
    const page = parsePage(req, res);
    if (page === null) return;
    const f = orderFilters(req, res);
    if (f === null) return;
    const { sort, ...where } = f;

    const total = must(await countAdminOrders(db, where)).count;
    if (!checkPageInRange(res, page, total, ORDERS_PAGE_SIZE)) return;
    const orders =
      total > 0
        ? await adminListOrders(db, {
            ...where,
            sort: sort.field,
            dir: sort.dir,
            page_limit: ORDERS_PAGE_SIZE,
            page_offset: offset(page, ORDERS_PAGE_SIZE),
          })
        : [];
    ok(
      res,
      200,
      "Orders fetched",
      orders,
      paginationMeta(total, page, ORDERS_PAGE_SIZE),
    );
  });

  /**
   * ExportOrders is the orders list as CSV: the same filters and order as
   * ListOrders, every matching order up to maxExportRows, amounts in major
   * units. Cells that a spreadsheet would run as a formula are defused.
   */
  admin.get("/orders/export.csv", async (req, res) => {
    const f = orderFilters(req, res);
    if (f === null) return;
    const { sort, ...where } = f;
    const rows = await adminExportOrders(db, {
      ...where,
      sort: sort.field,
      dir: sort.dir,
      max_rows: MAX_EXPORT_ROWS,
    });
    const name = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    res.status(200);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Cache-Control", "no-store");
    // end, not send: no ETag or 304 for a download (gin sent neither).
    res.end(exportCsv(rows));
  });

  /** GetOrder is one order with its items, customer and payment. */
  admin.get("/orders/:number", async (req, res) => {
    const number = pathNumber(req, res);
    if (number === null) return;
    const order = await adminGetOrder(db, number);
    if (order === null) {
      fail(res, 404, "ORDER_NOT_FOUND", "Order not found");
      return;
    }
    await respondOrder(req, res, db, order, "Order fetched");
  });

  /** Answers a fulfilment change with the order as it now is. */
  async function changed(
    req: Request,
    res: Response,
    change: Promise<Order>,
    message: string,
  ) {
    let order: Order;
    try {
      order = await change;
    } catch (err) {
      if (err instanceof Refusal) {
        fail(res, err.status, err.code, err.message);
        return;
      }
      internal(req, res, "failed to update order", err);
      return;
    }
    await respondOrder(req, res, db, order, message);
  }

  /** ShipOrder marks a paid order shipped. */
  admin.post("/orders/:number/ship", async (req, res) => {
    const number = pathNumber(req, res);
    if (number === null) return;
    const body = parseBody(ShipOrderBodySchema, req, res);
    if (body === null) return;
    await changed(
      req,
      res,
      deps.checkout.ship(number, body.tracking_number ?? ""),
      "Order shipped",
    );
  });

  /** DeliverOrder marks a shipped order delivered. */
  admin.post("/orders/:number/deliver", async (req, res) => {
    const number = pathNumber(req, res);
    if (number === null) return;
    await changed(req, res, deps.checkout.deliver(number), "Order delivered");
  });

  /** CancelOrder cancels an unpaid order and returns its stock. */
  admin.post("/orders/:number/cancel", async (req, res) => {
    const number = pathNumber(req, res);
    if (number === null) return;
    await changed(
      req,
      res,
      deps.checkout.cancelPending(number),
      "Order cancelled",
    );
  });

  /** RefundOrder refunds a paid order in full through Stripe. */
  admin.post("/orders/:number/refund", async (req, res) => {
    if (!deps.checkout.enabled()) {
      fail(
        res,
        503,
        "PAYMENTS_UNAVAILABLE",
        "Payments are not set up on this server",
      );
      return;
    }
    const number = pathNumber(req, res);
    if (number === null) return;
    const body = parseBody(RefundOrderBodySchema, req, res);
    if (body === null) return;
    await changed(
      req,
      res,
      deps.checkout.refundPaid(number, body.restock),
      "Order refunded",
    );
  });

  /**
   * ListCustomers is every customer account, newest first unless sorted
   * otherwise, searched by a piece of the name or email, with their order
   * count, spend and last order.
   */
  admin.get("/customers", async (req, res) => {
    const page = parsePage(req, res);
    if (page === null) return;
    const q = searchQuery(req, res);
    if (q === null) return;
    const pattern = q !== "" ? containsPattern(q) : null;
    const sort = parseSort(req, res, CUSTOMER_SORTS, "joined");
    if (sort === null) return;

    const total = must(await countAdminCustomers(db, pattern)).count;
    if (!checkPageInRange(res, page, total, CUSTOMERS_PAGE_SIZE)) return;
    const customers =
      total > 0
        ? await adminListCustomers(db, {
            pattern,
            sort: sort.field,
            dir: sort.dir,
            page_limit: CUSTOMERS_PAGE_SIZE,
            page_offset: offset(page, CUSTOMERS_PAGE_SIZE),
          })
        : [];
    ok(
      res,
      200,
      "Customers fetched",
      customers,
      paginationMeta(total, page, CUSTOMERS_PAGE_SIZE),
    );
  });

  /**
   * GetCustomer is one customer account with their totals, saved addresses
   * and latest reviews; admins aren't customers (404). Their orders come
   * from the orders list (?customer=).
   */
  admin.get("/customers/:userID", async (req, res) => {
    const id = pathUuid(req, res, "userID", "INVALID_USER_ID", "user ID");
    if (id === null) return;
    const [customer, addresses, reviews] = await Promise.all([
      adminGetCustomer(db, id),
      listAddresses(db, id),
      adminCustomerReviews(db, id),
    ]);
    if (customer === null) {
      fail(res, 404, "CUSTOMER_NOT_FOUND", "Customer not found");
      return;
    }
    ok(res, 200, "Customer fetched", {
      ...customer,
      average_order_value:
        customer.paid_orders > 0
          ? Math.trunc(customer.spend / customer.paid_orders)
          : 0,
      addresses,
      reviews,
    });
  });

  /** SetStoreTheme switches the storefront's theme. */
  admin.put("/settings", async (req, res) => {
    const body = parseBody(ThemeBody, req, res);
    if (body === null) return;
    ok(
      res,
      200,
      "Store theme updated",
      must(await updateStoreTheme(db, body.theme)),
    );
  });

  /**
   * SetAnnouncements replaces the messages in the storefront's scrolling top
   * banner, in order; an empty list hides the banner.
   */
  admin.put("/settings/announcements", async (req, res) => {
    const body = parseBody(AnnouncementsBodySchema, req, res);
    if (body === null) return;
    ok(
      res,
      200,
      "Announcements updated",
      must(await updateAnnouncements(db, body.announcements)),
    );
  });
}
