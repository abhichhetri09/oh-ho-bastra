import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

const tag = "Admin";
const base = "/api/v1/admin/attributes";
const id = z.object({ attributeID: Uuid });
const notFound = "No such option list (ATTRIBUTE_NOT_FOUND)";
const duplicate =
  "Another option list has the name, ignoring case (ATTRIBUTE_ALREADY_EXISTS, with the field in errors)";

export function registerAttributePaths() {
  operation({
    method: "get",
    path: base,
    operationId: "adminListAttributes",
    tag,
    summary: "Option lists",
    description:
      "The store's option lists (Size, Colour…) with their values, in order; variant options are picked from them.",
    auth: "admin",
    success: {
      status: 200,
      description: "Option lists fetched",
      schema: schemas.AttributeListResponseSchema,
    },
  });

  operation({
    method: "post",
    path: base,
    operationId: "adminCreateAttribute",
    tag,
    summary: "Create an option list",
    auth: "admin",
    request: body(schemas.AttributeBodySchema),
    success: {
      status: 201,
      description: "Option list created",
      schema: schemas.AttributeResponseSchema,
    },
    errors: { 400: "Invalid body (VALIDATION_FAILED)", 409: duplicate },
  });

  operation({
    method: "put",
    path: `${base}/{attributeID}`,
    operationId: "adminUpdateAttribute",
    tag,
    summary: "Save an option list",
    description:
      "Renames it and replaces its values, in order. Variants already made keep their own options.",
    auth: "admin",
    request: { params: id, ...body(schemas.AttributeBodySchema) },
    success: {
      status: 200,
      description: "Option list saved",
      schema: schemas.AttributeResponseSchema,
    },
    errors: {
      400: "Invalid id or body (INVALID_ATTRIBUTE_ID, VALIDATION_FAILED)",
      404: notFound,
      409: duplicate,
    },
  });

  operation({
    method: "delete",
    path: `${base}/{attributeID}`,
    operationId: "adminDeleteAttribute",
    tag,
    summary: "Delete an option list",
    description: "Variants made from it keep their options.",
    auth: "admin",
    request: { params: id },
    success: {
      status: 200,
      description: "Option list deleted",
      schema: schemas.MessageResponseSchema,
    },
    errors: { 400: "Invalid id (INVALID_ATTRIBUTE_ID)", 404: notFound },
  });
}
