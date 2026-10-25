import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { Deps } from "./deps";
import {
  accessLog,
  corsMiddleware,
  errorHandler,
  requestId,
} from "./http/middleware";
import { jsonReplacer } from "./http/response";
import { createGroup, fallback, type RouteRecord } from "./http/router";
import { adminRoutes } from "./routes/admin";
import { adminCatalogRoutes } from "./routes/admin-catalog";
import { adminEmailRoutes } from "./routes/admin-emails";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { categoryRoutes } from "./routes/categories";
import { checkoutRoutes } from "./routes/checkout";
import { contactRoutes } from "./routes/contact";
import { shoppingRoutes } from "./routes/shopping";
import { systemRoutes } from "./routes/system";

export interface App {
  app: Express;
  /** Every documented route, for the 405 fallback and the contract test. */
  routes: RouteRecord[];
}

export function buildApp(deps: Deps): App {
  const app = express();
  app.disable("x-powered-by");
  app.set("json replacer", jsonReplacer);
  // Only listed proxies may set X-Forwarded-For; otherwise req.ip is the
  // socket address, so clients can't spoof the ip we log and store.
  app.set(
    "trust proxy",
    typeof deps.cfg.trustedProxies === "number"
      ? deps.cfg.trustedProxies
      : deps.cfg.trustedProxies.length
        ? deps.cfg.trustedProxies
        : false,
  );

  app.use(requestId);
  app.use(accessLog);
  app.use(corsMiddleware(deps.cfg));
  app.use(cookieParser());
  // The raw bytes are kept for the Stripe webhook's signature check.
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );

  const routes: RouteRecord[] = [];
  const api = createGroup(app, routes, "/api/v1");

  systemRoutes(app, api, deps);
  authRoutes(api, deps);
  categoryRoutes(api, deps);
  catalogRoutes(api, deps);
  adminCatalogRoutes(api, deps);
  shoppingRoutes(api, deps);
  checkoutRoutes(api, deps);
  contactRoutes(api, deps);
  adminEmailRoutes(api, deps);
  adminRoutes(api, deps);

  // JSON for unknown paths and wrong methods too.
  app.use(fallback(routes));
  app.use(errorHandler);
  return { app, routes };
}
