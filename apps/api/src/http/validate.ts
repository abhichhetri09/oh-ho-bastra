import type { Request, Response } from "express";
import type { z } from "zod";
import { ValidationCodeSchema, type ValidationCode } from "@repo/types";
import { rlog } from "../log";
import { validationFailed, type AppError } from "./response";

// Request bodies are checked against the zod schemas in packages/types (the
// same ones the web's forms use), and failures are reported the way the Go
// API did: one item per field with a code, a react-hook-form path
// ("properties.0.name") and a message. A schema's own message wins;
// otherwise the message is built from the rule ("Name is required").

/** Labels that aren't the humanized field name. */
const LABELS: Record<string, string> = {
  image_public_ids: "Image public IDs",
  category_id: "Category",
  token: "Reset link",
};

/** Marks messages zod made up itself, so a schema's own message can win. */
const DEFAULT = "\u0000default";

const humanize = (name: string) => {
  const s = name.replaceAll("_", " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function labelFor(path: PropertyKey[]): string {
  const name = [...path]
    .reverse()
    .find((p): p is string => typeof p === "string");
  if (!name) return "Request body";
  return LABELS[name] ?? humanize(name);
}

function valueAt(input: unknown, path: PropertyKey[]): unknown {
  let v: unknown = input;
  for (const key of path) {
    if (v === null || typeof v !== "object") return undefined;
    v = (v as Record<PropertyKey, unknown>)[key];
  }
  return v;
}

const kindName: Record<string, string> = {
  string: "a string",
  boolean: "true or false",
  int: "a whole number",
  number: "a number",
  array: "a list",
  object: "an object",
};

const isValidationCode = (c: unknown): c is ValidationCode =>
  ValidationCodeSchema.safeParse(c).success;

/** Drops null object properties: like Go's decoder, null means "not given". */
function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== null) out[k] = dropNulls(v);
  }
  return out;
}

/**
 * Drops top-level "" values of optional fields that "" isn't valid for
 * (e.g. parent_id: ""), which Go's omitempty rules read as "not given".
 */
function dropEmptyOptionals(schema: z.ZodType, value: unknown): unknown {
  const shape =
    "shape" in schema ? (schema.shape as Record<string, z.ZodType>) : undefined;
  if (
    !shape ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  )
    return value;
  const out: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
  };
  for (const [key, v] of Object.entries(out)) {
    const field = shape[key];
    if (typeof v !== "string" || v.trim() !== "" || !field) continue;
    if (!field.safeParse(v).success && field.safeParse(undefined).success)
      delete out[key];
  }
  return out;
}

function toAppError(issue: z.core.$ZodIssue, input: unknown): AppError {
  const path = issue.path;
  const field = path.map(String).join(".");
  const label = labelFor(path);
  const custom = issue.message !== DEFAULT ? issue.message : undefined;
  const item = (code: ValidationCode, message: string): AppError =>
    field
      ? { code, field, message: custom ?? message }
      : { code, message: custom ?? message };

  switch (issue.code) {
    case "invalid_type": {
      if (valueAt(input, path) === undefined)
        return item("REQUIRED_FIELD", `${label} is required`);
      // Go reported a type error on the list or object, not the element.
      const at = path.findIndex((p) => typeof p === "number");
      const head = at === -1 ? path : path.slice(0, at);
      const headField = head.map(String).join(".");
      const message = `${head.length ? labelFor(head) : "Request body"} must be ${kindName[issue.expected] ?? "an object"}`;
      return headField
        ? { code: "INVALID_TYPE", field: headField, message }
        : { code: "INVALID_TYPE", message };
    }
    case "too_small": {
      const min = String(issue.minimum);
      if (issue.origin === "string") {
        const v = valueAt(input, path);
        if (typeof v === "string" && v.trim() === "")
          return item("REQUIRED_FIELD", `${label} is required`);
        return item("TOO_SHORT", `${label} must be at least ${min} characters`);
      }
      if (issue.origin === "array" || issue.origin === "set") {
        return item("TOO_SHORT", `${label} must have at least ${min} item(s)`);
      }
      return item(
        "OUT_OF_RANGE",
        issue.inclusive
          ? `${label} must be at least ${min}`
          : `${label} must be greater than ${min}`,
      );
    }
    case "too_big": {
      const max = String(issue.maximum);
      if (issue.origin === "string")
        return item("TOO_LONG", `${label} cannot exceed ${max} characters`);
      if (issue.origin === "array" || issue.origin === "set") {
        return item(
          "TOO_LONG",
          `${label} cannot have more than ${max} item(s)`,
        );
      }
      return item(
        "OUT_OF_RANGE",
        issue.inclusive
          ? `${label} must be at most ${max}`
          : `${label} must be less than ${max}`,
      );
    }
    case "invalid_format":
      switch (issue.format) {
        case "email":
          return item("INVALID_EMAIL", `Enter a valid ${label.toLowerCase()}`);
        case "uuid":
        case "guid":
          return item("INVALID_UUID", `${label} must be a valid ID`);
        case "url":
          return item("INVALID_URL", `${label} must be a valid URL`);
        case "date":
          return item(
            "INVALID_DATE",
            `${label} must be a valid date (YYYY-MM-DD)`,
          );
        case "datetime":
          return item("INVALID_DATE", `${label} must be a valid date and time`);
        default:
          return item("INVALID_FORMAT", `${label} is invalid`);
      }
    case "invalid_value":
      return item(
        "INVALID_VALUE",
        `${label} must be one of: ${issue.values.map(String).join(", ")}`,
      );
    case "custom": {
      const code = issue.params?.code;
      return item(
        isValidationCode(code) ? code : "VALIDATION_ERROR",
        `${label} is invalid`,
      );
    }
    default:
      return item("VALIDATION_ERROR", `${label} is invalid`);
  }
}

/** The failures of a parse, at most one per field (the first, as in Go). */
export function issuesToErrors(error: z.ZodError, input: unknown): AppError[] {
  const typeError = error.issues.find(
    (i) => i.code === "invalid_type" && valueAt(input, i.path) !== undefined,
  );
  // A wrong JSON type stopped Go's decoder at once: that one error only.
  if (typeError) return [toAppError(typeError, input)];
  const seen = new Set<string>();
  const out: AppError[] = [];
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(toAppError(issue, input));
  }
  return out;
}

/**
 * The request body parsed with schema, or null after a 400 listing what
 * was wrong. Strings are trimmed by the schemas that want it (z.trim()).
 */
export function parseBody<S extends z.ZodType>(
  schema: S,
  req: Request,
  res: Response,
): z.output<S> | null {
  const body: unknown = req.body;
  // express.json turns an empty JSON body into {}; Go's decoder refused it.
  if (body === undefined || req.headers["content-length"] === "0") {
    rlog.warn(req, "invalid request payload", { error: "empty request body" });
    validationFailed(res, [
      { code: "INVALID_REQUEST", message: "Invalid request body" },
    ]);
    return null;
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    rlog.warn(req, "invalid request payload", {
      error: "body is not an object",
    });
    validationFailed(res, [
      { code: "INVALID_TYPE", message: `Request body must be an object` },
    ]);
    return null;
  }
  const input = dropEmptyOptionals(schema, dropNulls(body));
  const result = schema.safeParse(input, {
    error: () => DEFAULT,
    reportInput: true,
  });
  if (!result.success) {
    rlog.warn(req, "invalid request payload", { error: result.error.message });
    validationFailed(res, issuesToErrors(result.error, input));
    return null;
  }
  return result.data;
}
