"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ForgotPasswordBodySchema } from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFocusFirstError } from "@/hooks/use-focus-first-error";
import { forgotPassword } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { LOGIN_PATH } from "@/lib/auth/redirect";

/**
 * Asks for an email and sends a reset link. The answer is the same whether
 * or not the email has an account, so the page says "if".
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { ref: formRef, focusFirstError } = useFocusFirstError();

  const send = useMutation({
    mutationFn: async (body: { email: string }) => {
      await forgotPassword({ body, throwOnError: true });
    },
    onSuccess: (_data, body) => setSentTo(body.email),
    onError: (err) => {
      const apiError = getApiError(err);
      const fields = mapFieldErrors(apiError?.errors);
      if (fields.email) {
        setError(fields.email);
        focusFirstError();
        return;
      }
      toast.error(
        apiError?.message ?? "Couldn't send the link. Try again in a moment.",
      );
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ForgotPasswordBodySchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      focusFirstError();
      return;
    }
    setError(undefined);
    send.mutate(parsed.data);
  }

  if (sentTo) {
    return (
      <div className="w-full max-w-sm space-y-6" role="status">
        <p className="eyebrow animate-rise">Check your email</p>
        <h1 className="display animate-rise text-5xl sm:text-6xl">
          Link <em>sent.</em>
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          If an account uses <span className="text-foreground">{sentTo}</span>,
          a link to choose a new password is on its way. It works once, for the
          next hour. Nothing there? Check spam, or try again in a minute.
        </p>
        <div className="flex flex-wrap gap-3 border-t border-border pt-6">
          <Link
            href={LOGIN_PATH}
            className="text-sm font-medium underline underline-offset-4"
          >
            Back to sign in
          </Link>
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Use another email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="w-full max-w-sm"
    >
      <div className="mb-10 space-y-3">
        <p className="eyebrow animate-rise">Forgot your password?</p>
        <h1
          className="display animate-rise text-5xl sm:text-6xl"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          Reset <em>it.</em>
        </h1>
        <p
          className="animate-rise text-sm text-muted-foreground"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          Enter your account&apos;s email and we&apos;ll send you a link to
          choose a new password.
        </p>
      </div>

      <FieldGroup>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="email" className="eyebrow !text-foreground">
            Email
          </FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(undefined);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "email-error" : undefined}
          />
          <FieldError key={error} id="email-error" className="animate-rise">
            {error}
          </FieldError>
        </Field>
        <Button
          className="mt-2 w-full"
          size="lg"
          type="submit"
          disabled={send.isPending}
        >
          {send.isPending ? "Sending…" : "Send reset link"}
        </Button>
      </FieldGroup>

      <p className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href={LOGIN_PATH}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
