import type { Express, RequestHandler } from "express";
import { match } from "path-to-regexp";
import { fail } from "./response";

// Routes are registered through Group so the app knows every (method, path)
// it serves: unknown paths get a JSON 404, a known path with the wrong
// method a 405 (as gin did), and a test checks the list against
// openapi.json. A group's middleware runs only for its own routes, never for
// a path that doesn't exist.

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteRecord {
  method: Method;
  /** Express syntax: /api/v1/products/:productSlug */
  path: string;
}

export interface Group {
  get(path: string, ...handlers: RequestHandler[]): void;
  post(path: string, ...handlers: RequestHandler[]): void;
  put(path: string, ...handlers: RequestHandler[]): void;
  patch(path: string, ...handlers: RequestHandler[]): void;
  delete(path: string, ...handlers: RequestHandler[]): void;
  /** A sub-group under prefix whose routes also run `middleware` first. */
  group(prefix: string, ...middleware: RequestHandler[]): Group;
}

export function createGroup(
  app: Express,
  routes: RouteRecord[],
  base = "",
  middleware: RequestHandler[] = [],
): Group {
  const add =
    (method: Method) =>
    (path: string, ...handlers: RequestHandler[]) => {
      const full = base + path || "/";
      routes.push({ method, path: full });
      const lower = method.toLowerCase() as Lowercase<Method>;
      app[lower](full, ...middleware, ...handlers);
    };
  return {
    get: add("GET"),
    post: add("POST"),
    put: add("PUT"),
    patch: add("PATCH"),
    delete: add("DELETE"),
    group: (prefix, ...mw) =>
      createGroup(app, routes, base + prefix, [...middleware, ...mw]),
  };
}

/** The JSON 404 and 405 for whatever no route answered. */
export function fallback(routes: RouteRecord[]): RequestHandler {
  const matchers = routes.map((r) => ({
    method: r.method,
    test: match(r.path, { decode: false }),
  }));
  return (req, res) => {
    const allowed = matchers.some((m) => m.test(req.path) !== false);
    if (allowed) {
      fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
      return;
    }
    fail(res, 404, "ROUTE_NOT_FOUND", "Route not found");
  };
}
