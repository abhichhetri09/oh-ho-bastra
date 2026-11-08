import type { Response } from "express";
import {
  AttributeBodySchema,
  type Attribute,
  type AttributeBody,
} from "@repo/types";
import {
  addAttributeValue,
  clearAttributeValues,
  createAttribute,
  deleteAttribute,
  listAttributes,
  updateAttribute,
} from "../db/gen";
import { pgCode, UNIQUE_VIOLATION, withTx, type Pool } from "../db/pool";
import type { Queryable } from "../db/queryable";
import type { Deps } from "../deps";
import { requireAuth, requireRole } from "../http/middleware";
import { pathUuid } from "../http/params";
import { fail, ok } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";

// Attributes, for the admin: the store's option lists (Size, Colour…) that
// variant options are picked from (migrations/000039). Saving one replaces
// its whole list of values, in order.

class Duplicate extends Error {}

function duplicateName(res: Response, name: string) {
  res.status(409).json({
    success: false,
    message: "Another option list has this name",
    code: "ATTRIBUTE_ALREADY_EXISTS",
    errors: [
      {
        code: "DUPLICATE_ITEM",
        field: "name",
        message: `${name} is already an option list`,
      },
    ],
  });
}

const notFound = (res: Response) =>
  fail(res, 404, "ATTRIBUTE_NOT_FOUND", "Option list not found");

/** The values in order; a colour keeps its swatch, text drops it. */
async function writeValues(tx: Queryable, id: string, body: AttributeBody) {
  await clearAttributeValues(tx, id);
  for (const [position, v] of body.values.entries()) {
    await addAttributeValue(tx, {
      attribute_id: id,
      value: v.value,
      hex: body.type === "color" ? (v.hex ?? null) : null,
      position,
    });
  }
}

/** One attribute as the list shows it. */
async function readAttribute(db: Pool, id: string) {
  const all = (await listAttributes(db)) as unknown as Attribute[];
  return all.find((a) => a.id === id) ?? null;
}

/** Runs a write, turning a duplicate name into a Duplicate. */
async function named<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (pgCode(err) === UNIQUE_VIOLATION) throw new Duplicate();
    throw err;
  }
}

export function adminAttributeRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;
  const admin = api.group(
    "/admin/attributes",
    requireAuth(cfg),
    requireRole("admin"),
  );

  admin.get("", async (_req, res) => {
    ok(res, 200, "Option lists fetched", await listAttributes(db));
  });

  admin.post("", async (req, res) => {
    const body = parseBody(AttributeBodySchema, req, res);
    if (!body) return;
    let id: string;
    try {
      id = await withTx(db, async (tx) => {
        const created = await named(() =>
          createAttribute(tx, { name: body.name, type: body.type }),
        );
        if (!created) throw new Error("create attribute returned no row");
        await writeValues(tx, created.id, body);
        return created.id;
      });
    } catch (err) {
      if (err instanceof Duplicate) return duplicateName(res, body.name);
      throw err;
    }
    ok(res, 201, "Option list created", await readAttribute(db, id));
  });

  /** Renames it and replaces its values, in order. */
  admin.put("/:attributeID", async (req, res) => {
    const id = pathUuid(
      req,
      res,
      "attributeID",
      "INVALID_ATTRIBUTE_ID",
      "attribute ID",
    );
    if (!id) return;
    const body = parseBody(AttributeBodySchema, req, res);
    if (!body) return;
    let found: boolean;
    try {
      found = await withTx(db, async (tx) => {
        const updated = await named(() =>
          updateAttribute(tx, { id, name: body.name, type: body.type }),
        );
        if (!updated) return false;
        await writeValues(tx, id, body);
        return true;
      });
    } catch (err) {
      if (err instanceof Duplicate) return duplicateName(res, body.name);
      throw err;
    }
    if (!found) return notFound(res);
    ok(res, 200, "Option list saved", await readAttribute(db, id));
  });

  /** Variants made from it keep their options. */
  admin.delete("/:attributeID", async (req, res) => {
    const id = pathUuid(
      req,
      res,
      "attributeID",
      "INVALID_ATTRIBUTE_ID",
      "attribute ID",
    );
    if (!id) return;
    if ((await deleteAttribute(db, id)) === 0) return notFound(res);
    ok(res, 200, "Option list deleted");
  });
}
