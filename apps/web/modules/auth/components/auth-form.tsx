"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { z } from "zod";
import {
  LoginBodySchema,
  RegisterBodySchema,
  type LoginBody,
  type RegisterBody,
} from "@repo/types";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFocusFirstError } from "@/hooks/use-focus-first-error";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { safeNextPath } from "@/lib/auth/redirect";

type AuthFormProps =
  | {
      mode: "login";
      isPending: boolean;
      onSubmit: (body: LoginBody) => Promise<unknown>;
    }
  | {
      mode: "register";
      isPending: boolean;
      onSubmit: (body: RegisterBody) => Promise<unknown>;
    };

type FormValues = { name: string; email: string; password: string };
type FieldName = keyof FormValues;

function issuesToFieldErrors(error: z.ZodError): Record<string, string> {
  return mapFieldErrors(
    error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  );
}

export function AuthForm(props: AuthFormProps) {
  const isRegister = props.mode === "register";
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [values, setValues] = useState<FormValues>({
    name: "",
    email: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { ref: formRef, focusFirstError } = useFocusFirstError();

  function fail(errors: Record<string, string>) {
    setFieldErrors(errors);
    focusFirstError();
  }

  function updateField(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const rest = { ...current };
      delete rest[field];
      return rest;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    try {
      if (props.mode === "register") {
        const parsed = RegisterBodySchema.safeParse(values);
        if (!parsed.success) {
          fail(issuesToFieldErrors(parsed.error));
          return;
        }
        await props.onSubmit(parsed.data);
      } else {
        const parsed = LoginBodySchema.safeParse({
          email: values.email,
          password: values.password,
        });
        if (!parsed.success) {
          fail(issuesToFieldErrors(parsed.error));
          return;
        }
        await props.onSubmit(parsed.data);
      }
    } catch (error) {
      // The mutation already showed a toast; add per-field messages.
      fail(mapFieldErrors(getApiError(error)?.errors));
    }
  }

  function field(
    name: FieldName,
    label: string,
    input: React.ReactNode,
    hint?: string,
  ) {
    return (
      <Field data-invalid={Boolean(fieldErrors[name])}>
        <FieldLabel htmlFor={name} className="eyebrow !text-foreground">
          {label}
        </FieldLabel>
        {input}
        {hint && !fieldErrors[name] && (
          <FieldDescription id={`${name}-hint`} className="text-xs">
            {hint}
          </FieldDescription>
        )}
        {/* key: a new message replays the entrance. */}
        <FieldError
          key={fieldErrors[name]}
          id={`${name}-error`}
          className="animate-rise"
        >
          {fieldErrors[name]}
        </FieldError>
      </Field>
    );
  }

  /** Points an input at its error, else its hint, for screen readers. */
  function describedBy(name: FieldName, hasHint = false) {
    if (fieldErrors[name]) return `${name}-error`;
    return hasHint ? `${name}-hint` : undefined;
  }

  const otherHref = `${isRegister ? "/auth/login" : "/auth/register"}${
    next ? `?next=${encodeURIComponent(next)}` : ""
  }`;

  return (
    <form
      ref={formRef}
      className="w-full max-w-sm"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="mb-10 space-y-3">
        <p className="eyebrow animate-rise">
          {isRegister ? "Join Oh Ho Bastra" : "Welcome back"}
        </p>
        <h1
          className="display animate-rise text-5xl sm:text-6xl"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          {isRegister ? (
            <>
              Create your <em>account.</em>
            </>
          ) : (
            <>
              Sign <em>in.</em>
            </>
          )}
        </h1>
        <p
          className="animate-rise text-sm text-muted-foreground"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          {isRegister
            ? "Save your bag, check out faster and track every order."
            : "Pick up where you left off."}
        </p>
      </div>

      <FieldGroup>
        {isRegister &&
          field(
            "name",
            "Name",
            <Input
              id="name"
              name="name"
              autoComplete="name"
              value={values.name}
              onChange={(e) => updateField("name", e.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={describedBy("name")}
            />,
          )}
        {field(
          "email",
          "Email",
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => updateField("email", e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={describedBy("email")}
          />,
        )}
        {field(
          "password",
          "Password",
          <PasswordInput
            id="password"
            name="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={values.password}
            onChange={(e) => updateField("password", e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={describedBy("password", isRegister)}
          />,
          isRegister ? "8 to 72 characters." : undefined,
        )}
        {!isRegister && (
          <Link
            href="/auth/forgot"
            className="-mt-3 self-end text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        )}

        <Button
          className="mt-2 w-full"
          size="lg"
          type="submit"
          disabled={props.isPending}
        >
          {props.isPending
            ? isRegister
              ? "Creating account…"
              : "Signing in…"
            : isRegister
              ? "Create account"
              : "Sign in"}
        </Button>
      </FieldGroup>

      <p className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
        {isRegister ? "Already have an account?" : "New to Oh Ho Bastra?"}{" "}
        <Link
          className="font-medium text-foreground underline underline-offset-4"
          href={otherHref}
        >
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
