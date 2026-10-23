import type { Request, Response } from "express";
import { parsePage, query } from "../http/params";
import { fail } from "../http/response";

// The query string of the storefront listings (GET /products and
// GET /categories/:slug), read as the Go API read it.

/** listingPageSize divides evenly into 2, 3 and 4 column grids. */
export const LISTING_PAGE_SIZE = 24;

/** Bounds price_min/price_max (in cents); it matches the largest variant price. */
export const MAX_PRICE_FILTER = 100_000_000;

/** Bounds the repeated option query parameter. */
export const MAX_OPTION_FILTERS = 20;
/** Matches the variant property name/value length limits. */
const MAX_OPTION_PART = 20;

/** Bounds the q query parameter (in characters). */
export const MAX_SEARCH_LENGTH = 100;
/** Caps the words a search matches on; later ones are ignored. */
const MAX_SEARCH_TERMS = 8;

/**
 * The accepted values of the sort query parameter. relevance only means
 * something with a search; without one it falls back to newest.
 */
export const SORT_OPTIONS = ["relevance", "newest", "price_asc", "price_desc"];

export interface ListingQuery {
  page: number;
  sort: string;
  searchTerms: string[];
  featured: boolean;
  priceMin: number;
  priceMax: number;
  optionNames: string[];
  optionValues: string[];
}

/** Length in code points, like utf8.RuneCountInString. */
const runeCount = (s: string) => [...s].length;

/**
 * Lowercases code point by code point, like Go's strings.ToLower: no
 * final-sigma rule, and İ becomes a plain i.
 */
const goLower = (s: string) =>
  Array.from(s, (c) => (c === "İ" ? "i" : c.toLowerCase())).join("");

/** Trims Unicode White_Space, like Go's strings.TrimSpace (not U+FEFF). */
const goTrimSpace = (s: string) =>
  s.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");

/** Every value of a query parameter, like gin's c.QueryArray. */
function queryArray(req: Request, name: string): string[] {
  const v = req.query[name];
  if (Array.isArray(v))
    return v.filter((x): x is string => typeof x === "string");
  return typeof v === "string" ? [v] : [];
}

/**
 * Splits a search into lowercase words of letters (with their combining
 * marks) and digits, deduplicated and capped at MAX_SEARCH_TERMS.
 * Everything else separates words, so "t-shirt" searches for "t" and
 * "shirt", and no term can carry tsquery syntax. A search without letters or
 * digits has no terms.
 */
export function searchTerms(raw: string): string[] {
  const terms: string[] = [];
  for (const word of goLower(raw).split(/[^\p{L}\p{M}\p{Nd}]+/u)) {
    if (terms.length === MAX_SEARCH_TERMS) break;
    if (word !== "" && !terms.includes(word)) terms.push(word);
  }
  return terms;
}

/** An optional price filter in cents; "" means no bound (0). Null when invalid. */
export function parsePrice(raw: string): number | null {
  if (raw === "") return 0;
  // strconv.Atoi: an optional sign and decimal digits
  if (!/^[+-]?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n < 0 || n > MAX_PRICE_FILTER ? null : n;
}

/**
 * Splits repeated name:value filters into parallel arrays
 * (variant_matches_options pairs them by index). Duplicates are dropped.
 * Null when invalid.
 */
export function parseOptions(
  raw: string[],
): { names: string[]; values: string[] } | null {
  if (raw.length > MAX_OPTION_FILTERS) return null;
  const names: string[] = [];
  const values: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const at = r.indexOf(":");
    if (at === -1) return null;
    const name = goTrimSpace(r.slice(0, at));
    const value = goTrimSpace(r.slice(at + 1));
    if (
      !name ||
      !value ||
      runeCount(name) > MAX_OPTION_PART ||
      runeCount(value) > MAX_OPTION_PART
    )
      return null;
    const key = `${name}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    values.push(value);
  }
  return { names, values };
}

/** The listing's query parameters, or null after a 400. */
export function parseListingQuery(
  req: Request,
  res: Response,
): ListingQuery | null {
  const page = parsePage(req, res);
  if (page === null) return null;

  const search = query(req, "q");
  if (runeCount(search) > MAX_SEARCH_LENGTH) {
    fail(
      res,
      400,
      "INVALID_QUERY_PARAMETER",
      "q must be at most 100 characters",
    );
    return null;
  }
  const terms = searchTerms(search);

  // A search sorts by relevance unless told otherwise.
  let sort =
    req.query.sort === undefined
      ? terms.length > 0
        ? "relevance"
        : "newest"
      : query(req, "sort");
  if (!SORT_OPTIONS.includes(sort)) {
    fail(
      res,
      400,
      "INVALID_QUERY_PARAMETER",
      "sort must be one of: relevance, newest, price_asc, price_desc",
    );
    return null;
  }
  if (sort === "relevance" && terms.length === 0) sort = "newest";

  let featured = false;
  switch (query(req, "featured")) {
    case "":
    case "false":
      break;
    case "true":
      featured = true;
      break;
    default:
      fail(
        res,
        400,
        "INVALID_QUERY_PARAMETER",
        "featured must be true or false",
      );
      return null;
  }

  const priceMin = parsePrice(query(req, "price_min"));
  const priceMax = parsePrice(query(req, "price_max"));
  if (
    priceMin === null ||
    priceMax === null ||
    (priceMin > 0 && priceMax > 0 && priceMin > priceMax)
  ) {
    fail(res, 400, "INVALID_PRICE_FILTER", "Invalid price filter");
    return null;
  }

  const options = parseOptions(queryArray(req, "option"));
  if (!options) {
    fail(
      res,
      400,
      "INVALID_QUERY_PARAMETER",
      "option must be name:value (at most 20)",
    );
    return null;
  }

  return {
    page,
    sort,
    searchTerms: terms,
    featured,
    priceMin,
    priceMax,
    optionNames: options.names,
    optionValues: options.values,
  };
}
