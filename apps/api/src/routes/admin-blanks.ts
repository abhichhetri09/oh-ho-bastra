import type { Response } from "express";
import { BlankBodySchema } from "@repo/types";
import { createBlank, deleteBlank, listBlanks, updateBlank } from "../db/gen";
import { pgCode, UNIQUE_VIOLATION } from "../db/pool";
import type { Deps } from "../deps";
import { requireAuth, requireRole } from "../http/middleware";
import { pathUuid } from "../http/params";
import { fail, ok } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";

// Blanks, for the admin: plain garments printed to order, whose stock the
// variants linked to them share (migrations/000038). A shop has a few dozen
// at most, so the list is one page.

/** A name another blank has (ignoring case): a 409 on the field. */
function duplicateName(res: Response, name: string) {
  res.status(409).json({
    success: false,
    message: "Another blank has this name",
    code: "BLANK_ALREADY_EXISTS",
    errors: [
      {
        code: "DUPLICATE_ITEM",
        field: "name",
        message: `${name} is already a blank's name`,
      },
    ],
  });
}

const notFound = (res: Response) =>
  fail(res, 404, "BLANK_NOT_FOUND", "Blank not found");

export function adminBlankRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;
  const admin = api.group(
    "/admin/blanks",
    requireAuth(cfg),
    requireRole("admin"),
  );

  /** Every blank by name, with how many variants draw on it. */
  admin.get("", async (_req, res) => {
    ok(res, 200, "Blanks fetched", await listBlanks(db));
  });

  admin.post("", async (req, res) => {
    const body = parseBody(BlankBodySchema, req, res);
    if (!body) return;
    let created;
    try {
      created = await createBlank(db, body);
    } catch (err) {
      if (pgCode(err) === UNIQUE_VIOLATION)
        return duplicateName(res, body.name);
      throw err;
    }
    if (!created) throw new Error("create blank returned no row");
    ok(res, 201, "Blank created", created);
  });

  /**
   * Renames a blank and sets its counted stock (an absolute value, so a
   * retry is harmless); every variant on it takes the new count.
   */
  admin.put("/:blankID", async (req, res) => {
    const id = pathUuid(req, res, "blankID", "INVALID_BLANK_ID", "blank ID");
    if (!id) return;
    const body = parseBody(BlankBodySchema, req, res);
    if (!body) return;
    let updated;
    try {
      updated = await updateBlank(db, { id, ...body });
    } catch (err) {
      if (pgCode(err) === UNIQUE_VIOLATION)
        return duplicateName(res, body.name);
      throw err;
    }
    if (!updated) return notFound(res);
    ok(res, 200, "Blank updated", updated);
  });

  /** Deletes a blank; its variants keep the count they had, as their own. */
  admin.delete("/:blankID", async (req, res) => {
    const id = pathUuid(req, res, "blankID", "INVALID_BLANK_ID", "blank ID");
    if (!id) return;
    if ((await deleteBlank(db, id)) === 0) return notFound(res);
    ok(res, 200, "Blank deleted");
  });
}
