import type { z } from "zod";
import { mapFieldErrors } from "@/lib/api/errors";

/**
 * Field errors from a failed zod parse, in plain words instead of zod's
 * defaults ("Too small: expected string to have >=1 characters").
 * `labels` names each field for the messages: { city: "a city" }.
 */
export function friendlyFieldErrors(
  error: z.ZodError,
  labels: Record<string, string> = {},
): Record<string, string> {
  return mapFieldErrors(
    error.issues.map((issue) => {
      const field = issue.path.join(".");
      const label = labels[field] ?? "a value";
      return { field, message: friendlyMessage(issue, label) };
    }),
  );
}

function friendlyMessage(issue: z.core.$ZodIssue, label: string): string {
  switch (issue.code) {
    case "too_small":
      return issue.origin === "string" && Number(issue.minimum) <= 1
        ? `Enter ${label}`
        : issue.origin === "string"
          ? `Use at least ${issue.minimum} characters`
          : `Choose ${label}`;
    case "too_big":
      return issue.origin === "string"
        ? `Use at most ${issue.maximum} characters`
        : `Choose ${label}`;
    case "invalid_value":
    case "invalid_type":
      return `Choose ${label}`;
    default:
      return issue.message;
  }
}

/** Field errors without the given fields, for clearing them as they're edited. */
export function withoutErrors(
  errors: Record<string, string>,
  ...fields: string[]
): Record<string, string> {
  if (!fields.some((f) => f in errors)) return errors;
  const next = { ...errors };
  for (const f of fields) delete next[f];
  return next;
}
