import { describe, expect, test } from "bun:test";
import type { CategoryNode, StorefrontVariant } from "@repo/types";
import { formatPrice, fromCents, toCents } from "@/lib/money";
import { activeNav } from "@/lib/nav";
import {
  buildCategoryTree,
  categoryPath,
  childCategories,
} from "@/modules/catalog/lib/category-tree";
import cloudinaryLoader from "@/lib/image-loader";
import { formatPriceShort, percentOff } from "@/lib/money";
import { swatchColor } from "@/lib/swatches";
import {
  activeFilterCount,
  clearFilters,
  DEFAULT_FILTERS,
  filtersToSearch,
  isSearching,
  listingQuery,
  normalizeSearch,
  parseFilters,
  sortOptionsFor,
  toggleOption,
  withSearch,
} from "@/modules/catalog/lib/filters";
import { addRecent, MAX_RECENT } from "@/modules/search/lib/recent-searches";
import { compareOptionValues } from "@/modules/catalog/lib/option-order";
import {
  findVariant,
  isAvailable,
  optionGroups,
  pickOption,
} from "@/modules/catalog/lib/variants";

describe("money", () => {
  test("formats cents", () => {
    expect(formatPrice(2900)).toBe("€29.00");
    expect(formatPrice(5)).toBe("€0.05");
  });
  test("parses amounts to cents", () => {
    expect(toCents("12.5")).toBe(1250);
    expect(toCents(" 20 ")).toBe(2000);
    expect(toCents("0.07")).toBe(7);
    expect(toCents("1.005")).toBeNull();
    expect(toCents("-1")).toBeNull();
    expect(toCents("abc")).toBeNull();
    expect(toCents("")).toBeNull();
    expect(fromCents(1250)).toBe("12.5");
  });
});

describe("money extras", () => {
  test("short prices drop .00", () => {
    expect(formatPriceShort(2900)).toBe("€29");
    expect(formatPriceShort(2950)).toBe("€29.50");
    expect(percentOff(8900, 6900)).toBe(22);
    expect(percentOff(0, 0)).toBe(0);
  });
});

describe("listing filters", () => {
  test("defaults", () => {
    expect(parseFilters({})).toEqual(DEFAULT_FILTERS);
    expect(parseFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
  });

  test("parses sort, prices, featured and options", () => {
    const filters = parseFilters(
      new URLSearchParams(
        "sort=price_desc&min=20&max=80.5&featured=true&size=M&color=Black&size=L&size=M",
      ),
    );
    expect(filters).toEqual({
      q: "",
      sort: "price_desc",
      priceMin: 2000,
      priceMax: 8050,
      featured: true,
      // deduplicated and sorted, so the query key is stable
      options: ["color:Black", "size:L", "size:M"],
    });
  });

  test("record and URLSearchParams sources agree", () => {
    expect(parseFilters({ size: ["M", "L"], sort: "price_asc" })).toEqual(
      parseFilters(new URLSearchParams("size=L&sort=price_asc&size=M")),
    );
  });

  test("falls back on bad values and swaps a reversed range", () => {
    const filters = parseFilters({ sort: "cheap", min: "x", featured: "yes" });
    expect(filters.sort).toBe("newest");
    expect(filters.priceMin).toBe(0);
    expect(filters.featured).toBe(false);
    const swapped = parseFilters({ min: "80", max: "20" });
    expect([swapped.priceMin, swapped.priceMax]).toEqual([2000, 8000]);
    expect(parseFilters({ max: "2000000" }).priceMax).toBe(0);
  });

  test("ignores reserved keys and invalid options", () => {
    const filters = parseFilters({
      page: "2",
      q: "shoe",
      variant: "abc",
      "": "x",
      size: "",
      "a:b": "c",
      [`${"x".repeat(21)}`]: "y",
    });
    expect(filters.options).toEqual([]);
  });

  test("caps the option count at the API limit", () => {
    const params = new URLSearchParams();
    for (let i = 0; i < 25; i++) params.append("size", String(i));
    expect(parseFilters(params).options).toHaveLength(20);
  });

  test("round trips through the URL", () => {
    const filters = parseFilters(
      new URLSearchParams("sort=price_asc&min=19.99&color=Rust&size=M"),
    );
    expect(filtersToSearch(filters)).toBe(
      "sort=price_asc&min=19.99&color=Rust&size=M",
    );
    expect(parseFilters(new URLSearchParams(filtersToSearch(filters)))).toEqual(
      filters,
    );
    expect(filtersToSearch(DEFAULT_FILTERS)).toBe("");
  });

  test("API query leaves defaults out", () => {
    expect(listingQuery(DEFAULT_FILTERS, 1)).toEqual({ page: 1 });
    expect(
      listingQuery(
        {
          ...DEFAULT_FILTERS,
          sort: "price_asc",
          featured: true,
          priceMax: 500,
          options: ["size:M"],
        },
        3,
      ),
    ).toEqual({
      page: 3,
      sort: "price_asc",
      featured: true,
      price_max: 500,
      option: ["size:M"],
    });
  });

  test("toggle, count and clear", () => {
    const on = toggleOption(DEFAULT_FILTERS, "size", "M");
    expect(on.options).toEqual(["size:M"]);
    expect(toggleOption(on, "size", "M").options).toEqual([]);
    const busy = {
      ...on,
      priceMin: 100,
      featured: true,
      sort: "price_desc" as const,
    };
    expect(activeFilterCount(busy)).toBe(3);
    expect(clearFilters(busy)).toEqual({
      ...DEFAULT_FILTERS,
      sort: "price_desc",
    });
    // the search survives clearing filters and doesn't count as one
    const searched = { ...busy, q: "linen" };
    expect(activeFilterCount(searched)).toBe(3);
    expect(clearFilters(searched).q).toBe("linen");
  });

  test("option values sort like a size chart", () => {
    expect(["L", "XS", "M", "XL", "S"].sort(compareOptionValues)).toEqual([
      "XS",
      "S",
      "M",
      "L",
      "XL",
    ]);
    expect(["42", "40", "9"].sort(compareOptionValues)).toEqual([
      "9",
      "40",
      "42",
    ]);
    expect(["Rust", "Azure"].sort(compareOptionValues)).toEqual([
      "Azure",
      "Rust",
    ]);
  });
});

describe("cloudinary loader", () => {
  const base = "https://res.cloudinary.com/demo/image/upload";

  test("adds the resize before the public ID", () => {
    expect(cloudinaryLoader({ src: `${base}/shirt.jpg`, width: 640 })).toBe(
      `${base}/f_auto,q_auto,c_limit,w_640/shirt.jpg`,
    );
    expect(
      cloudinaryLoader({
        src: `${base}/samples/ecommerce/shoes.jpg`,
        width: 320,
        quality: 60,
      }),
    ).toBe(`${base}/f_auto,q_60,c_limit,w_320/samples/ecommerce/shoes.jpg`);
  });

  test("keeps existing transformations first", () => {
    expect(
      cloudinaryLoader({
        src: `${base}/c_crop,g_center,w_0.5,h_0.5/c_fill,g_auto,ar_4:5/docs/blue_sweater.jpg`,
        width: 828,
      }),
    ).toBe(
      `${base}/c_crop,g_center,w_0.5,h_0.5/c_fill,g_auto,ar_4:5/f_auto,q_auto,c_limit,w_828/docs/blue_sweater.jpg`,
    );
  });

  test("tags local files with the width", () => {
    expect(cloudinaryLoader({ src: "/editorial/a.jpg", width: 64 })).toBe(
      "/editorial/a.jpg?w=64",
    );
  });

  test("leaves other URLs alone", () => {
    expect(
      cloudinaryLoader({ src: "https://example.com/a.jpg", width: 64 }),
    ).toBe("https://example.com/a.jpg");
  });
});

describe("swatches", () => {
  test("known colours map, unknown ones don't", () => {
    expect(swatchColor(" Rust ")).toMatch(/^oklch/);
    expect(swatchColor("Mustard")).toMatch(/^oklch/);
    expect(swatchColor("Moonbeam")).toBeNull();
  });
});

const node = (
  id: string,
  slug: string,
  parent_id: string | null,
  depth: number,
): CategoryNode => ({
  id,
  name: slug,
  slug,
  parent_id,
  depth,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

describe("category tree", () => {
  const nodes = [
    node("1", "clothing", null, 0),
    node("2", "home", null, 0),
    node("3", "shoes", "1", 1),
    node("4", "boots", "3", 2),
  ];

  test("nests children", () => {
    const tree = buildCategoryTree(nodes);
    expect(tree.map((n) => n.slug)).toEqual(["clothing", "home"]);
    expect(tree[0]?.children[0]?.children[0]?.slug).toBe("boots");
  });

  test("path and children", () => {
    expect(categoryPath(nodes, "boots").map((n) => n.slug)).toEqual([
      "clothing",
      "shoes",
      "boots",
    ]);
    expect(categoryPath(nodes, "nope")).toEqual([]);
    expect(childCategories(nodes, "clothing").map((n) => n.slug)).toEqual([
      "shoes",
    ]);
  });

  test("path terminates on a cycle", () => {
    const cyclic = [node("a", "a", "b", 0), node("b", "b", "a", 0)];
    expect(categoryPath(cyclic, "a").length).toBeLessThanOrEqual(3);
  });
});

const variant = (
  id: string,
  options: Record<string, string>,
): StorefrontVariant => ({
  id,
  product_id: "p",
  sku: null,
  stock: 1,
  images: [],
  selling_price: 100,
  offer_price: null,
  price: 100,
  offer_expires_at: null,
  is_default: id === "1",
  created_at: "2026-01-01T00:00:00Z",
  options: Object.entries(options).map(([name, value]) => ({
    name,
    value,
    type: name === "color" ? ("color" as const) : ("text" as const),
  })),
});

describe("variants", () => {
  const variants = [
    variant("1", { color: "Red", size: "M" }),
    variant("2", { color: "Red", size: "L" }),
    variant("3", { color: "Blue", size: "M" }),
  ];

  test("groups options: colours first, values in shopper order", () => {
    const sizeFirst = [variant("1", { size: "L", color: "Red" }), ...variants];
    expect(optionGroups(sizeFirst)).toEqual([
      { name: "color", type: "color", values: ["Blue", "Red"] },
      { name: "size", type: "text", values: ["M", "L"] },
    ]);
    expect(optionGroups([variant("1", {})])).toEqual([]);
  });

  test("finds the exact combination", () => {
    expect(findVariant(variants, { color: "Red", size: "L" })?.id).toBe("2");
    expect(findVariant(variants, { color: "Blue", size: "L" })).toBeUndefined();
  });

  test("picking keeps other choices when possible", () => {
    // Red/L → Blue: Blue/L doesn't exist, so Blue/M.
    expect(
      pickOption(variants, { color: "Red", size: "L" }, "color", "Blue")?.id,
    ).toBe("3");
    // Red/M → L keeps Red.
    expect(
      pickOption(variants, { color: "Red", size: "M" }, "size", "L")?.id,
    ).toBe("2");
  });

  test("availability against the other choices", () => {
    const sel = { color: "Blue", size: "M" };
    expect(isAvailable(variants, sel, "size", "L")).toBe(false);
    expect(isAvailable(variants, sel, "color", "Red")).toBe(true);
  });
});

describe("search", () => {
  test("normalises the search", () => {
    expect(normalizeSearch("  linen   shirt ")).toBe("linen shirt");
    expect(normalizeSearch("a".repeat(150))).toHaveLength(100);
    // capped by code points, so an emoji is never split in half
    expect(Array.from(normalizeSearch("😀".repeat(120)))).toHaveLength(100);
    expect(isSearching("!!")).toBe(false);
    expect(isSearching("टोपी")).toBe(true);
  });

  test("a search sorts by relevance by default", () => {
    const filters = parseFilters(new URLSearchParams("q=linen"));
    expect(filters).toEqual({
      ...DEFAULT_FILTERS,
      q: "linen",
      sort: "relevance",
    });
    // the default sort stays out of the URL and the API query
    expect(filtersToSearch(filters)).toBe("q=linen");
    expect(listingQuery(filters, 1)).toEqual({ page: 1, q: "linen" });
    // a chosen sort is kept, newest included
    const newest = parseFilters(new URLSearchParams("q=linen&sort=newest"));
    expect(newest.sort).toBe("newest");
    expect(listingQuery(newest, 1)).toEqual({
      page: 1,
      q: "linen",
      sort: "newest",
    });
  });

  test("relevance needs a search", () => {
    expect(parseFilters(new URLSearchParams("sort=relevance")).sort).toBe(
      "newest",
    );
    expect(
      parseFilters(new URLSearchParams("q=%21%21&sort=relevance")).sort,
    ).toBe("newest");
    expect(sortOptionsFor("").map((o) => o.value)).not.toContain("relevance");
    expect(sortOptionsFor("tee").map((o) => o.value)).toContain("relevance");
  });

  test("withSearch moves a default sort along and keeps a chosen one", () => {
    const searched = withSearch(DEFAULT_FILTERS, " linen ");
    expect(searched).toMatchObject({ q: "linen", sort: "relevance" });
    expect(withSearch(searched, "")).toMatchObject({ q: "", sort: "newest" });
    const cheap = { ...searched, sort: "price_asc" as const };
    expect(withSearch(cheap, "wool").sort).toBe("price_asc");
    expect(withSearch(cheap, "").sort).toBe("price_asc");
  });

  test("recent searches", () => {
    expect(addRecent(["Linen", "wool"], "linen")).toEqual(["linen", "wool"]);
    const many = addRecent(["a", "b", "c", "d", "e"], "f");
    expect(many).toHaveLength(MAX_RECENT);
    expect(many[0]).toBe("f");
  });
});

describe("active nav", () => {
  const categories = [
    { slug: "home", children: [{ slug: "decor" }, { slug: "kitchen" }] },
    { slug: "clothing", children: [{ slug: "tops" }] },
  ];
  test("marks the section a page belongs to", () => {
    expect(activeNav("/shop", false, categories)).toBe("shop");
    expect(activeNav("/shop", true, categories)).toBe("featured");
    expect(activeNav("/categories/home", false, categories)).toBe("home");
    expect(activeNav("/categories/decor", false, categories)).toBe("home");
    expect(activeNav("/categories/tops", false, categories)).toBe("clothing");
    expect(activeNav("/categories/unknown", false, categories)).toBeNull();
    expect(activeNav("/products/tee", false, categories)).toBeNull();
    expect(activeNav("/", false, categories)).toBeNull();
  });
});
