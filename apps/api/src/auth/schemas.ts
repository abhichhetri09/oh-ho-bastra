import { z } from "zod";
import type { ValidationCode } from "@repo/types";

// The auth request bodies, checked exactly as the Go API's binding tags did
// (internal/types/auth.go). The shared schemas in @repo/types carry the web
// forms' friendlier messages ("Enter your current password"), and z.email
// is stricter than Go's validator, so the API keeps its own rules here:
// strings are trimmed unless the field opts out, lengths count characters
// (runes, not UTF-16 units), each field reports its first failing rule in
// tag order, and the messages are the validator's.

/** go-playground/validator's "email" pattern (v10.20.0), verbatim. */
const EMAIL =
  /^(?:(?:(?:(?:[a-zA-Z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])+(?:\.([a-zA-Z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])+)*)|(?:(?:\x22)(?:(?:(?:(?:\x20|\x09)*(?:\x0d\x0a))?(?:\x20|\x09)+)?(?:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])|(?:(?:[\x01-\x09\x0b\x0c\x0d-\x7f]|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}]))))*(?:(?:(?:\x20|\x09)*(?:\x0d\x0a))?(\x20|\x09)+)?(?:\x22))))@(?:(?:(?:[a-zA-Z]|\d|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])|(?:(?:[a-zA-Z]|\d|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])(?:[a-zA-Z]|\d|-|\.|~|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])*(?:[a-zA-Z]|\d|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])))\.)+(?:(?:[a-zA-Z]|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])|(?:(?:[a-zA-Z]|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])(?:[a-zA-Z]|\d|-|\.|~|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])*(?:[a-zA-Z]|[\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}])))\.?$/u;

/** Go's personname rule: José, O'Brien, Mary-Jane, J. R. */
const PERSON_NAME = /^\p{L}[\p{L}\p{M} '’.-]*$/u;

interface Rules {
  label: string;
  /** Leave the value as sent (trim:"-"). */
  raw?: boolean;
  min?: number;
  max?: number;
  email?: boolean;
  personName?: boolean;
  /** A msg_email override. */
  emailMessage?: string;
}

const runes = (s: string) => [...s].length;

/** A required string field with Go's rules, in Go's order. */
function goString(r: Rules) {
  const base = r.raw ? z.string() : z.string().trim();
  return base.superRefine((v, ctx) => {
    const fail = (code: ValidationCode, message: string) =>
      ctx.addIssue({ code: "custom", message, params: { code } });
    if (v === "") return fail("REQUIRED_FIELD", `${r.label} is required`);
    if (r.email && !EMAIL.test(v)) {
      return fail(
        "INVALID_EMAIL",
        r.emailMessage ?? `Enter a valid ${r.label.toLowerCase()}`,
      );
    }
    if (r.min !== undefined && runes(v) < r.min) {
      return fail(
        "TOO_SHORT",
        `${r.label} must be at least ${r.min} characters`,
      );
    }
    if (r.max !== undefined && runes(v) > r.max) {
      return fail("TOO_LONG", `${r.label} cannot exceed ${r.max} characters`);
    }
    if (r.personName && !PERSON_NAME.test(v)) {
      fail(
        "INVALID_FORMAT",
        `${r.label} can only contain letters, spaces, apostrophes and hyphens`,
      );
    }
  });
}

// required,not_blank,min=2,max=50,personname (not_blank can't fail once
// required passed on the trimmed value)
const name = goString({ label: "Name", min: 2, max: 50, personName: true });
// required,email,max=254 msg_email:"Enter a valid email address"
const email = goString({
  label: "Email",
  email: true,
  max: 254,
  emailMessage: "Enter a valid email address",
});

/** The email rule, for other bodies that take one (a guest's checkout, order lookups). */
export const EmailField = email;

export const RegisterBody = z.object({
  name,
  email,
  password: goString({ label: "Password", raw: true, min: 8, max: 72 }),
});

export const LoginBody = z.object({
  email,
  password: goString({ label: "Password", raw: true, max: 72 }),
});

export const ForgotPasswordBody = z.object({ email });

/** The token is the one from the emailed link; it isn't trimmed or changed. */
export const ResetPasswordBody = z.object({
  token: goString({ label: "Reset link", raw: true, max: 100 }),
  password: goString({ label: "Password", raw: true, min: 8, max: 72 }),
});

export const UpdateProfileBody = z.object({ name });

export const ChangePasswordBody = z.object({
  current_password: goString({ label: "Current password", raw: true, max: 72 }),
  new_password: goString({ label: "New password", raw: true, min: 8, max: 72 }),
});
