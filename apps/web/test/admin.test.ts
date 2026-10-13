import { describe, expect, test } from "bun:test";
import type { CategoryNode } from "@repo/types";
import { withoutErrors } from "@/lib/forms";
import {
  categoryPath,
  orderTree,
  subtreeIds,
} from "@/modules/admin/lib/categories";
import { fromLocalInput, toLocalInput } from "@/modules/admin/lib/datetime";
import {
  adminProductsQuery,
  adminProductsSearch,
  EMPTY_FILTERS,
  pageWindow,
  parseAdminProductFilters,
} from "@/modules/admin/lib/filters";
import {
  adminOrdersQuery,
  adminCustomersQuery,
  adminCustomersSearch,
  adminOrdersSearch,
  adminReviewsQuery,
  adminReviewsSearch,
  adminEmailsSearch,
  adminOrdersExportQuery,
  EMPTY_ORDER_FILTERS,
  adminInventoryQuery,
  adminInventorySearch,
  parseAdminCustomerFilters,
  parseAdminEmailFilters,
  parseAdminInventoryFilters,
  parseAdminOrderFilters,
  parseAdminReviewFilters,
} from "@/modules/admin/lib/order-filters";
import { move, rejectImage } from "@/modules/admin/lib/upload";

describe("admin product filters", () => {
  test("parse search params, falling back on junk", () => {
    expect(parseAdminProductFilters({})).toEqual(EMPTY_FILTERS);
    expect(
      parseAdminProductFilters({
        page: "3",
        q: "  linen ",
        status: "inactive",
        category: "tops",
      }),
    ).toEqual({
      ...EMPTY_FILTERS,
      page: 3,
      q: "linen",
      status: "inactive",
      category: "tops",
    });
    expect(parseAdminProductFilters({ page: "-1", status: "deleted" })).toEqual(
      EMPTY_FILTERS,
    );
    expect(parseAdminProductFilters({ page: "2.5" }).page).toBe(1);
    expect(parseAdminProductFilters({ q: ["a", "b"] }).q).toBe("a");
  });

  test("query and URL leave out defaults", () => {
    expect(adminProductsQuery(EMPTY_FILTERS)).toEqual({ page: 1 });
    expect(adminProductsSearch(EMPTY_FILTERS)).toBe("");
    const f = {
      ...EMPTY_FILTERS,
      page: 2,
      q: "wool coat",
      status: "active" as const,
    };
    expect(adminProductsQuery(f)).toEqual({
      page: 2,
      q: "wool coat",
      status: "active",
    });
    expect(adminProductsSearch(f)).toBe("?q=wool+coat&status=active&page=2");
    const sorted = { ...f, sort: "price" as const, dir: "asc" as const };
    expect(adminProductsQuery(sorted)).toMatchObject({
      sort: "price",
      dir: "asc",
    });
    expect(
      parseAdminProductFilters(
        Object.fromEntries(new URLSearchParams(adminProductsSearch(sorted))),
      ),
    ).toEqual(sorted);
    expect(parseAdminProductFilters({ sort: "colour" }).sort).toBe("");
    // a round trip gives the same filters
    const params = Object.fromEntries(
      new URLSearchParams(adminProductsSearch(f)),
    );
    expect(parseAdminProductFilters(params)).toEqual(f);
  });

  test("page window", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(1, 10)).toEqual([1, 2, null, 10]);
    expect(pageWindow(10, 10)).toEqual([1, null, 9, 10]);
    // a gap of one page shows the page
    expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
    expect(pageWindow(7, 10)).toEqual([1, null, 6, 7, 8, 9, 10]);
  });
});

const node = (
  id: string,
  name: string,
  parent_id: string | null,
  depth: number,
): CategoryNode => ({
  id,
  name,
  slug: name.toLowerCase(),
  parent_id,
  depth,
  created_at: "2026-10-10T00:00:00Z",
  updated_at: "2026-10-10T00:00:00Z",
});

// As the API sends them: parents before children, not grouped.
const nodes = [
  node("h", "Home", null, 0),
  node("c", "Clothing", null, 0),
  node("t", "Tops", "c", 1),
  node("k", "Kitchen", "h", 1),
  node("b", "Bottoms", "c", 1),
  node("s", "Shirts", "t", 2),
];

describe("category tree", () => {
  test("orders each parent before its children, A–Z", () => {
    expect(orderTree(nodes).map((n) => n.name)).toEqual([
      "Clothing",
      "Bottoms",
      "Tops",
      "Shirts",
      "Home",
      "Kitchen",
    ]);
  });

  test("subtree and path", () => {
    expect([...subtreeIds(nodes, "c")].sort()).toEqual(["b", "c", "s", "t"]);
    expect([...subtreeIds(nodes, "s")]).toEqual(["s"]);
    expect(categoryPath(nodes, "s")).toBe("Clothing / Tops / Shirts");
    expect(categoryPath(nodes, "missing")).toBe("");
  });
});

describe("admin helpers", () => {
  test("move", () => {
    expect(move(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(move(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(move(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });

  test("rejectImage", () => {
    const file = (type: string, size: number) =>
      new File([new Uint8Array(size)], "photo", { type });
    expect(rejectImage(file("image/jpeg", 10))).toBeNull();
    expect(rejectImage(file("image/gif", 10))).toContain("isn't");
    expect(rejectImage(file("image/png", 11 * 1024 * 1024))).toContain("10 MB");
  });

  test("datetime-local round trip", () => {
    const iso = "2026-10-12T18:30:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(toLocalInput(null)).toBe("");
    expect(fromLocalInput("")).toBeUndefined();
    expect(fromLocalInput("nonsense")).toBeUndefined();
  });

  test("withoutErrors", () => {
    const errors = { name: "Enter a name", price: "Enter a price" };
    expect(withoutErrors(errors, "name")).toEqual({ price: "Enter a price" });
    // unchanged errors keep their identity (no re-render)
    expect(withoutErrors(errors, "stock")).toBe(errors);
  });
});

describe("admin order and review filters", () => {
  test("orders: parse, query and URL", () => {
    expect(parseAdminOrderFilters({})).toEqual(EMPTY_ORDER_FILTERS);
    const f = parseAdminOrderFilters({
      status: "paid",
      q: " OHB-1042 ",
      page: "2",
    });
    expect(f).toEqual({
      ...EMPTY_ORDER_FILTERS,
      page: 2,
      q: "OHB-1042",
      status: "paid",
    });
    expect(adminOrdersQuery(f)).toEqual({
      page: 2,
      q: "OHB-1042",
      status: "paid",
    });
    expect(adminOrdersSearch(f)).toBe("?status=paid&q=OHB-1042&page=2");
    expect(parseAdminOrderFilters({ status: "lost" }).status).toBe("");
    expect(adminOrdersSearch(parseAdminOrderFilters({}))).toBe("");
  });

  test("orders: dates and sort", () => {
    const f = parseAdminOrderFilters({
      from: "2026-10-01",
      to: "2026-10-12",
      sort: "total",
      dir: "asc",
    });
    expect(adminOrdersQuery(f)).toEqual({
      page: 1,
      from: "2026-10-01",
      to: "2026-10-12",
      sort: "total",
      dir: "asc",
    });
    expect(adminOrdersExportQuery(f)).not.toHaveProperty("page");
    expect(adminOrdersSearch(f)).toBe(
      "?from=2026-10-01&to=2026-10-12&sort=total&dir=asc",
    );
    const junk = parseAdminOrderFilters({
      from: "12/10/2026",
      sort: "email",
      dir: "up",
    });
    expect([junk.from, junk.sort, junk.dir]).toEqual(["", "", "desc"]);
  });

  test("orders: one customer's, by user ID only", () => {
    const id = "A13B1D37-6A2B-4E5C-9CAE-857134921FA5";
    const f = parseAdminOrderFilters({ customer: id, page: "1" });
    expect(f.customer).toBe(id.toLowerCase());
    expect(adminOrdersQuery(f)).toEqual({
      page: 1,
      customer: id.toLowerCase(),
    });
    expect(adminOrdersSearch(f)).toBe(`?customer=${id.toLowerCase()}`);
    expect(parseAdminOrderFilters({ customer: "1; drop" }).customer).toBe("");
  });

  test("inventory: parse, query and URL", () => {
    const f = parseAdminInventoryFilters({
      stock: "low",
      q: "boot",
      category: "shoes",
      hidden: "true",
      page: "2",
    });
    expect(f).toEqual({
      page: 2,
      q: "boot",
      stock: "low",
      category: "shoes",
      hidden: true,
    });
    expect(adminInventoryQuery(f)).toEqual({
      page: 2,
      q: "boot",
      stock: "low",
      category: "shoes",
      hidden: true,
    });
    expect(adminInventorySearch(f)).toBe(
      "?stock=low&q=boot&category=shoes&hidden=true&page=2",
    );
    const junk = parseAdminInventoryFilters({ stock: "lots", hidden: "1" });
    expect(junk.stock).toBe("");
    expect(junk.hidden).toBe(false);
    expect(adminInventorySearch(junk)).toBe("");
  });

  test("emails: parse and URL", () => {
    expect(parseAdminEmailFilters({ status: "failed" })).toEqual({
      page: 1,
      status: "failed",
    });
    expect(parseAdminEmailFilters({ status: "bounced" }).status).toBe("");
    expect(adminEmailsSearch({ page: 2, status: "sent" })).toBe(
      "?status=sent&page=2",
    );
  });

  test("customers: parse, query and URL", () => {
    const f = parseAdminCustomerFilters({ q: " ada ", page: "3" });
    expect(f).toEqual({ page: 3, q: "ada", sort: "", dir: "desc" });
    expect(adminCustomersQuery(f)).toEqual({ page: 3, q: "ada" });
    expect(adminCustomersSearch(f)).toBe("?q=ada&page=3");
    expect(adminCustomersSearch(parseAdminCustomerFilters({}))).toBe("");
  });

  test("reviews: parse, query and URL", () => {
    const f = parseAdminReviewFilters({ status: "hidden", rating: "1" });
    expect(f).toEqual({ page: 1, status: "hidden", rating: 1 });
    expect(adminReviewsQuery(f)).toEqual({
      page: 1,
      status: "hidden",
      rating: 1,
    });
    expect(adminReviewsSearch(f)).toBe("?status=hidden&rating=1");
    expect(parseAdminReviewFilters({ rating: "6", status: "x" })).toEqual({
      page: 1,
      status: "",
      rating: null,
    });
  });
});
