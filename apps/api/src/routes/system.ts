import { readFile } from "node:fs/promises";
import type { Express } from "express";
import type { Deps } from "../deps";
import { internal, ok } from "../http/response";
import type { Group } from "../http/router";

/**
 * The welcome and health routes, and the API docs: openapi.json and the
 * Scalar UI under /api/v1, with /docs as a shortcut. Only health is part of
 * the documented contract.
 */
export function systemRoutes(app: Express, api: Group, deps: Deps) {
  app.get("/", (_req, res) => ok(res, 200, "Welcome to the Oh Ho Bastra API"));

  api.get("/health", (_req, res) => ok(res, 200, "Server is up and running"));

  app.get("/api/v1/openapi.json", async (req, res) => {
    try {
      // committed at apps/api/openapi.json, so a failure here is a
      // deployment problem such as a wrong OPENAPI_PATH
      const spec = await readFile(deps.cfg.openapiPath);
      res.type("application/json").send(spec);
    } catch (err) {
      internal(req, res, "failed to read openapi spec", err, {
        path: deps.cfg.openapiPath,
      });
    }
  });

  app.get("/api/v1/docs/", (_req, res) => {
    res.type("text/html; charset=utf-8").send(SCALAR_HTML);
  });
  // The body Go's http.Redirect wrote.
  app.get(["/api/v1/docs", "/docs"], (_req, res) => {
    res
      .status(301)
      .location("/api/v1/docs/")
      .type("text/html; charset=utf-8")
      .send('<a href="/api/v1/docs/">Moved Permanently</a>.\n\n');
  });
}

// The Scalar API docs page. The script is pinned to an exact version with
// Subresource Integrity, so a changed CDN file is refused by the browser.
const SCALAR_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Oh Ho Bastra API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:," />
</head>
<body>
  <script id="api-reference" data-url="/api/v1/openapi.json"></script>
  <script
    src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.69.2/dist/browser/standalone.js"
    integrity="sha384-WIChsUVC1uJ+G1lFA6lPYzOUgXAe8dVxUFIZ7lcENNtV34Esuo81NIxsj8EAQeHB"
    crossorigin="anonymous"></script>
</body>
</html>
`;
