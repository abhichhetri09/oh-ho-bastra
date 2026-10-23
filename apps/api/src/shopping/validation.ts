import { z } from "zod";

// Body rules the shared schemas state differently from the Go binding tags,
// so the same input gets the same error as from the Go API.

/**
 * Go's `required` on a number refuses 0 as "<Label> is required", and a
 * non-number JSON value for an int field was "<Label> must be a whole
 * number" (zod reports z.int() on a string as expected "number").
 */
export function goInt(label: string, min: number, max: number) {
  return z
    .unknown()
    .superRefine((v, ctx) => {
      if (typeof v !== "number")
        ctx.addIssue({ code: "invalid_type", expected: "int", input: v });
    })
    .pipe(
      z
        .int()
        .refine((n) => n !== 0, {
          message: `${label} is required`,
          params: { code: "REQUIRED_FIELD" },
        })
        .min(min)
        .max(max),
    );
}

/**
 * A trimmed string Go required to be non-empty, at most max characters
 * (runes, which zod's max doesn't count: it counts UTF-16 units).
 */
export function goText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((s) => [...s].length <= max, {
      message: `${label} cannot exceed ${max} characters`,
      params: { code: "TOO_LONG" },
    });
}

/** A trimmed string Go required: "" and blanks are "<Label> is required". */
export function goRequired(label: string) {
  return z
    .string()
    .trim()
    .refine((s) => s !== "", {
      message: `${label} is required`,
      params: { code: "REQUIRED_FIELD" },
      abort: true,
    });
}
