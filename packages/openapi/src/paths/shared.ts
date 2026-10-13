import type { RouteConfig } from "@asteasolutions/zod-to-openapi";
import { z, type ZodType } from "zod";
import { registry } from "../registry.ts";
import { ACCESS_COOKIE, REFRESH_COOKIE, schemas } from "../schemas.ts";

/** "refresh-optional": the refresh cookie is used when present. */
type Auth = "public" | "user" | "admin" | "refresh" | "refresh-optional";

type Operation = {
  method: RouteConfig["method"];
  /** OpenAPI path, e.g. /api/v1/products/{productSlug} */
  path: string;
  /** Becomes the generated client function name. */
  operationId: string;
  tag: string;
  summary: string;
  description?: string;
  auth?: Auth;
  request?: RouteConfig["request"];
  success: {
    status: 200 | 201 | 202;
    description: string;
    schema: ZodType;
    /** application/json unless set (e.g. text/csv). */
    contentType?: string;
  };
  /** Endpoint-specific errors; auth and 500 errors are added from `auth`. */
  errors?: Partial<Record<400 | 401 | 403 | 404 | 409 | 502 | 503, string>>;
};

const json = (schema: ZodType, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const security: Record<Auth, RouteConfig["security"]> = {
  public: undefined,
  user: [{ [ACCESS_COOKIE]: [] }],
  admin: [{ [ACCESS_COOKIE]: [] }],
  refresh: [{ [REFRESH_COOKIE]: [] }],
  "refresh-optional": [{ [REFRESH_COOKIE]: [] }, {}],
};

/** Registers one endpoint with the shared error envelope on every error. */
export function operation(op: Operation) {
  const auth = op.auth ?? "public";
  const errors: Record<number, string> = {};
  for (const [status, description] of Object.entries(op.errors ?? {})) {
    if (description) errors[Number(status)] = description;
  }
  if (auth === "user" || auth === "admin") {
    errors[401] ??=
      "Missing or invalid access token (MISSING_ACCESS_TOKEN, INVALID_ACCESS_TOKEN, INVALID_TOKEN_CLAIMS)";
  }
  if (auth === "admin") {
    errors[403] ??= "Not an admin (FORBIDDEN)";
  }
  errors[500] = "Unexpected server error (INTERNAL_SERVER_ERROR)";

  const responses: RouteConfig["responses"] = {
    [op.success.status]: {
      description: op.success.description,
      content: {
        [op.success.contentType ?? "application/json"]: {
          schema: op.success.schema,
        },
      },
    },
  };
  for (const [status, description] of Object.entries(errors)) {
    responses[status] = json(schemas.ApiErrorSchema, description);
  }

  registry.registerPath({
    method: op.method,
    path: op.path,
    operationId: op.operationId,
    tags: [op.tag],
    summary: op.summary,
    description: op.description,
    security: security[auth],
    request: op.request,
    responses,
  });
}

/** A JSON request body. */
export const body = (schema: ZodType) => ({
  body: { required: true, content: { "application/json": { schema } } },
});

/** Query parameters shared by the storefront listings (24 per page). */
export const listingQuery = z.object({
  page: z
    .int()
    .min(1)
    .max(100_000)
    .optional()
    .openapi({ description: "1-based page number (default 1)" }),
  q: z.string().max(100).optional().openapi({
    description:
      "Search. Words of letters and digits (at most 8) all have to match, each as a prefix, against the name, category path, description and features. Without letters or digits it is ignored.",
    example: "linen shirt",
  }),
  sort: schemas.SortOptionSchema.optional().openapi({
    description:
      "Default `relevance` with a search, else `newest`; prices sort by what the customer pays",
  }),
  featured: z
    .boolean()
    .optional()
    .openapi({ description: "Only featured products (default false)" }),
  price_min: z
    .int()
    .min(0)
    .max(100_000_000)
    .optional()
    .openapi({ description: "Minimum price in cents; 0 means no bound" }),
  price_max: z
    .int()
    .min(0)
    .max(100_000_000)
    .optional()
    .openapi({ description: "Maximum price in cents; 0 means no bound" }),
  option: z
    .array(z.string())
    .max(20)
    .optional()
    .openapi({
      description:
        "Repeatable `name:value` filter. A product matches when one of its active variants has, for every named option, one of the given values (values of one option are ORed, options ANDed).",
      example: ["size:M", "color:Black"],
    }),
});

export const listingErrors = {
  400: "Invalid page, search, sort, featured, price or option filter (INVALID_PAGE_PARAMETER, INVALID_QUERY_PARAMETER, INVALID_PRICE_FILTER)",
} as const;
