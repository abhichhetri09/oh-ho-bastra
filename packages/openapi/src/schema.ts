import "./zod-extend.ts";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registerPaths } from "./paths/index.ts";
import { registry } from "./registry.ts";

registerPaths();

export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Oh Ho Bastra API",
      version: "1.0.0",
      description: [
        "REST API of the Oh Ho Bastra storefront (Express + TypeScript).",
        "",
        "- Auth uses HTTP-only cookies; browsers must send credentials.",
        "- Request and response bodies are snake_case JSON.",
        "- Money is always an integer amount in cents.",
        "- Every response has `success` and `message`. Failures add a machine-readable `code`, and validation failures list `errors` with a react-hook-form style `field` path.",
        "- Every response carries an `X-Request-ID` header (a valid incoming one is reused).",
      ].join("\n"),
    },
    servers: [{ url: "/", description: "Current host" }],
  });
}
