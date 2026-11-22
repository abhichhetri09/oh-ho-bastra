import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

const tag = "Admin";
const base = "/api/v1/admin/blanks";
const id = z.object({ blankID: Uuid });
const notFound = "No such blank (BLANK_NOT_FOUND)";
const duplicate =
  "Another blank has the name, ignoring case (BLANK_ALREADY_EXISTS, with the field in errors)";

export function registerBlankPaths() {
  operation({
    method: "get",
    path: base,
    operationId: "adminListBlanks",
    tag,
    summary: "Blanks",
    description:
      "Plain garments printed to order, by name, each with how many variants share its stock.",
    auth: "admin",
    success: {
      status: 200,
      description: "Blanks fetched",
      schema: schemas.BlankListResponseSchema,
    },
  });

  operation({
    method: "get",
    path: `${base}/garments`,
    operationId: "adminListGarments",
    tag,
    summary: "Garments",
    description:
      "The garments blanks belong to, with how many blanks each has.",
    auth: "admin",
    success: {
      status: 200,
      description: "Garments fetched",
      schema: schemas.GarmentListResponseSchema,
    },
  });

  operation({
    method: "post",
    path: `${base}/garments`,
    operationId: "adminSaveGarment",
    tag,
    summary: "Make a garment's blanks",
    description:
      'One blank per combination of the options, named "Garment, Black, M", with the price. A blank of that name already joins the garment and keeps its stock, so a resend is harmless.',
    auth: "admin",
    request: body(schemas.GarmentBodySchema),
    success: {
      status: 201,
      description: "Garment saved",
      schema: schemas.GarmentResponseSchema,
    },
    errors: { 400: "Invalid body (VALIDATION_FAILED)" },
  });

  operation({
    method: "post",
    path: base,
    operationId: "adminCreateBlank",
    tag,
    summary: "Create a blank",
    auth: "admin",
    request: body(schemas.BlankBodySchema),
    success: {
      status: 201,
      description: "Blank created",
      schema: schemas.BlankResponseSchema,
    },
    errors: { 400: "Invalid body (VALIDATION_FAILED)", 409: duplicate },
  });

  operation({
    method: "put",
    path: `${base}/{blankID}`,
    operationId: "adminUpdateBlank",
    tag,
    summary: "Update a blank",
    description:
      "Renames it and sets its counted stock (an absolute value), which every variant on it takes.",
    auth: "admin",
    request: { params: id, ...body(schemas.BlankBodySchema) },
    success: {
      status: 200,
      description: "Blank updated",
      schema: schemas.BlankResponseSchema,
    },
    errors: {
      400: "Invalid id or body (INVALID_BLANK_ID, VALIDATION_FAILED)",
      404: notFound,
      409: duplicate,
    },
  });

  operation({
    method: "delete",
    path: `${base}/{blankID}`,
    operationId: "adminDeleteBlank",
    tag,
    summary: "Delete a blank",
    description: "Its variants keep the stock they had, as their own.",
    auth: "admin",
    request: { params: id },
    success: {
      status: 200,
      description: "Blank deleted",
      schema: schemas.MessageResponseSchema,
    },
    errors: { 400: "Invalid id (INVALID_BLANK_ID)", 404: notFound },
  });
}
